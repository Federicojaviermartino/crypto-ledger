import { PrismaClient } from '@prisma/client';
import { NormalizedBlockchainEvent } from '../types/blockchain.types';

export class BlockchainEventService {
  constructor(private prisma: PrismaClient) {}

  async upsertEvents(events: NormalizedBlockchainEvent[]): Promise<number> {
    let upsertedCount = 0;

    for (const event of events) {
      try {
        await this.prisma.blockchainEvent.upsert({
          where: {
            txHash_logIndex_chain_network: {
              txHash: event.txHash,
              logIndex: event.logIndex ?? -1, // Use -1 for native transfers
              chain: event.chain,
              network: event.network,
            },
          },
          update: {
            // Only update if not processed
            processed: false,
          },
          create: {
            chain: event.chain,
            network: event.network,
            blockNumber: event.blockNumber,
            blockTimestamp: event.blockTimestamp,
            txHash: event.txHash,
            logIndex: event.logIndex,
            eventType: event.eventType,
            from: event.from.toLowerCase(),
            to: event.to.toLowerCase(),
            asset: event.asset,
            quantity: event.quantity,
            feeAmount: event.feeAmount,
            feeAsset: event.feeAsset,
            rawData: event.rawData,
            processed: false,
          },
        });

        upsertedCount++;
      } catch (error) {
        console.error(`Error upserting event ${event.txHash}:${event.logIndex}`, error);
      }
    }

    return upsertedCount;
  }

  async getCursor(chain: string, network: string, contractAddress?: string): Promise<bigint> {
    const cursor = await this.prisma.indexerCursor.findUnique({
      where: {
        chain_network_contractAddress: {
          chain,
          network,
          contractAddress: contractAddress || null,
        },
      },
    });

    return cursor ? cursor.lastBlockNumber : 0n;
  }

  async updateCursor(
    chain: string,
    network: string,
    blockNumber: bigint,
    contractAddress?: string,
    blockHash?: string
  ): Promise<void> {
    await this.prisma.indexerCursor.upsert({
      where: {
        chain_network_contractAddress: {
          chain,
          network,
          contractAddress: contractAddress || null,
        },
      },
      update: {
        lastBlockNumber: blockNumber,
        lastBlockHash: blockHash,
      },
      create: {
        chain,
        network,
        contractAddress: contractAddress || null,
        lastBlockNumber: blockNumber,
        lastBlockHash: blockHash,
      },
    });
  }

  async getUnprocessedEvents(limit: number = 100) {
    return this.prisma.blockchainEvent.findMany({
      where: { processed: false },
      orderBy: { blockTimestamp: 'asc' },
      take: limit,
    });
  }

  async markAsProcessed(eventIds: string[], journalEntryId?: string): Promise<void> {
    await this.prisma.blockchainEvent.updateMany({
      where: { id: { in: eventIds } },
      data: {
        processed: true,
        journalEntryId,
      },
    });
  }
}
