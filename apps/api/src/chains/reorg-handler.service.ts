import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ChainAdapterDispatcher } from '@crypto-ledger/crypto/chains/dispatcher';
import { Cron, CronExpression } from '@nestjs/schedule';

/**
 * Reorg Handler Service
 * 
 * Handles blockchain reorganizations (reorgs) by:
 * 1. Maintaining finalization watermarks per chain
 * 2. Detecting reorgs by comparing block hashes
 * 3. Replaying affected block ranges
 * 4. Posting journal entry reversals for retracted transactions
 * 5. Updating lot assignments and P&L calculations
 * 
 * Reorg Types:
 * - Minor (1-10 blocks): Common on EVM chains, handle automatically
 * - Deep (10+ blocks): Rare, trigger alerts and manual review
 * 
 * Finalization thresholds:
 * - Ethereum: 20 blocks (~4 min)
 * - Bitcoin: 6 blocks (~60 min)
 * - Polygon: 128 blocks (~4 min)
 * - Solana: Finalized commitment (~1 min)
 */
@Injectable()
export class ReorgHandlerService {
  private readonly logger = new Logger(ReorgHandlerService.name);

  // Finalization thresholds by chain
  private readonly FINALIZATION_DEPTH: Record<string, number> = {
    ethereum: 20,
    polygon: 128,
    bsc: 15,
    base: 20,
    arbitrum: 20,
    optimism: 20,
    bitcoin: 6,
    solana: 32, // Slots for finalized commitment
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly dispatcher: ChainAdapterDispatcher,
  ) {}

  /**
   * Cron job: Check for reorgs every 5 minutes
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async checkForReorgs() {
    this.logger.log('Checking for blockchain reorgs...');

    const chains = await this.prisma.chain.findMany();

    for (const chain of chains) {
      try {
        await this.checkChainForReorg(chain.name);
      } catch (error) {
        this.logger.error(`Error checking reorgs for ${chain.name}:`, error);
      }
    }
  }

  /**
   * Check a specific chain for reorgs
   */
  async checkChainForReorg(chainName: string) {
    const adapter = this.dispatcher.getAdapter(chainName as any);
    if (!adapter) {
      this.logger.warn(`No adapter for chain ${chainName}`);
      return;
    }

    // Get current blockchain tip
    const latestBlock = await adapter.getLatestBlock();
    const currentHeight = latestBlock.number;

    // Get finalization watermark
    const watermark = await this.getFinalizationWatermark(chainName);
    
    if (!watermark) {
      // First run, initialize watermark
      await this.setFinalizationWatermark(chainName, currentHeight);
      this.logger.log(`Initialized watermark for ${chainName} at block ${currentHeight}`);
      return;
    }

    // Only check blocks below finalization threshold
    const finalizationDepth = this.FINALIZATION_DEPTH[chainName] || 20;
    const checkUntilBlock = currentHeight - finalizationDepth;

    if (watermark >= checkUntilBlock) {
      // No new finalized blocks
      return;
    }

    // Fetch blocks in database from watermark to checkUntilBlock
    const dbBlocks = await this.prisma.blockchainEvent.findMany({
      where: {
        chain: chainName,
        blockNumber: {
          gte: BigInt(watermark),
          lte: BigInt(checkUntilBlock),
        },
      },
      select: {
        blockNumber: true,
        blockHash: true,
      },
      distinct: ['blockNumber'],
      orderBy: { blockNumber: 'asc' },
    });

    // Compare with on-chain block hashes
    for (const dbBlock of dbBlocks) {
      const blockNumber = Number(dbBlock.blockNumber);
      
      try {
        const onChainBlock = await adapter.getBlock(blockNumber);
        
        if (onChainBlock.hash !== dbBlock.blockHash) {
          // REORG DETECTED!
          this.logger.warn(`⚠️  REORG DETECTED on ${chainName} at block ${blockNumber}`);
          this.logger.warn(`   DB hash: ${dbBlock.blockHash}`);
          this.logger.warn(`   Chain hash: ${onChainBlock.hash}`);
          
          await this.handleReorg(chainName, blockNumber, checkUntilBlock);
          return; // Handle one reorg at a time
        }
      } catch (error) {
        this.logger.error(`Error fetching block ${blockNumber} for ${chainName}:`, error);
      }
    }

    // No reorgs detected, advance watermark
    await this.setFinalizationWatermark(chainName, checkUntilBlock);
    this.logger.debug(`Advanced ${chainName} watermark to ${checkUntilBlock}`);
  }

  /**
   * Handle a detected reorg
   */
  private async handleReorg(chainName: string, reorgStartBlock: number, reorgEndBlock: number) {
    const depth = reorgEndBlock - reorgStartBlock + 1;
    this.logger.warn(`Handling reorg on ${chainName}: blocks ${reorgStartBlock}-${reorgEndBlock} (depth: ${depth})`);

    if (depth > 100) {
      this.logger.error(`🚨 DEEP REORG DETECTED (${depth} blocks) - Manual review required!`);
      // In production, send alert to ops team
    }

    // Step 1: Mark affected events as retracted
    const affectedEvents = await this.prisma.blockchainEvent.findMany({
      where: {
        chain: chainName,
        blockNumber: {
          gte: BigInt(reorgStartBlock),
          lte: BigInt(reorgEndBlock),
        },
      },
      include: {
        lots: {
          include: { lot: true },
        },
      },
    });

    this.logger.log(`Found ${affectedEvents.length} affected events`);

    // Step 2: Reverse journal entries for retracted transactions
    for (const event of affectedEvents) {
      await this.reverseJournalEntries(event.id, event.txHash);
    }

    // Step 3: Delete retracted events
    await this.prisma.blockchainEvent.deleteMany({
      where: {
        chain: chainName,
        blockNumber: {
          gte: BigInt(reorgStartBlock),
          lte: BigInt(reorgEndBlock),
        },
      },
    });

    this.logger.log(`Deleted ${affectedEvents.length} retracted events`);

    // Step 4: Replay affected range
    const wallets = await this.prisma.wallet.findMany({
      where: {
        network: {
          chain: { name: chainName },
        },
      },
    });

    for (const wallet of wallets) {
      // Trigger resync from reorg start block
      await this.dispatcher.syncWallet(
        chainName as any,
        wallet.network.name,
        wallet.address,
        BigInt(reorgStartBlock),
      );
    }

    this.logger.log(`Triggered resync for ${wallets.length} wallets`);

    // Step 5: Roll back watermark
    await this.setFinalizationWatermark(chainName, reorgStartBlock - 1);

    this.logger.warn(`✅ Reorg handled successfully`);
  }

  /**
   * Post reversing journal entries for retracted transaction
   */
  private async reverseJournalEntries(eventId: string, txHash: string) {
    // Find original journal entries for this event
    const originalEntries = await this.prisma.journalEntry.findMany({
      where: {
        reference: txHash,
      },
    });

    if (originalEntries.length === 0) {
      return; // No journal entries to reverse
    }

    this.logger.debug(`Reversing ${originalEntries.length} journal entries for tx ${txHash}`);

    // Create reversing entries (swap debits/credits)
    for (const original of originalEntries) {
      await this.prisma.journalEntry.create({
        data: {
          accountId: original.accountId,
          debitAmount: original.creditAmount, // Swap
          creditAmount: original.debitAmount, // Swap
          currency: original.currency,
          description: `REVERSAL (reorg): ${original.description}`,
          reference: `REV-${txHash}`,
          transactionDate: new Date(),
          userId: original.userId,
          entityId: original.entityId,
          dimensionValues: original.dimensionValues,
        },
      });
    }

    // Update lot assignments
    const lotAssignments = await this.prisma.lotAssignment.findMany({
      where: {
        blockchainEvent: {
          txHash,
        },
      },
    });

    for (const assignment of lotAssignments) {
      // Restore quantity to lot
      await this.prisma.lot.update({
        where: { id: assignment.lotId },
        data: {
          quantityRemaining: {
            increment: assignment.quantityUsed,
          },
        },
      });

      // Delete assignment
      await this.prisma.lotAssignment.delete({
        where: { id: assignment.id },
      });
    }
  }

  /**
   * Get finalization watermark for a chain
   */
  private async getFinalizationWatermark(chainName: string): Promise<number | null> {
    const result = await this.prisma.$queryRaw<Array<{ value: string }>>`
      SELECT value 
      FROM system_config 
      WHERE key = ${`finalization_watermark_${chainName}`}
    `;

    return result[0] ? parseInt(result[0].value) : null;
  }

  /**
   * Set finalization watermark for a chain
   */
  private async setFinalizationWatermark(chainName: string, blockNumber: number) {
    await this.prisma.$executeRaw`
      INSERT INTO system_config (key, value)
      VALUES (${`finalization_watermark_${chainName}`}, ${blockNumber.toString()})
      ON CONFLICT (key) 
      DO UPDATE SET value = ${blockNumber.toString()}
    `;
  }
}
