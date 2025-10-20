import { ethers } from 'ethers';
import { PrismaClient } from '@prisma/client';

const ERC20_TRANSFER_EVENT = 'Transfer(address,address,uint256)';
const ERC20_ABI = [
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
  'event Transfer(address indexed from, address indexed to, uint256 value)',
];

/**
 * Ethereum blockchain indexer
 * Indexes native ETH transfers and ERC-20 token transfers
 */
export class EthereumIndexer {
  private provider: ethers.JsonRpcProvider;
  private prisma: PrismaClient;
  private network: string;

  constructor(rpcUrl: string, network: string, prisma: PrismaClient) {
    this.provider = new ethers.JsonRpcProvider(rpcUrl);
    this.network = network;
    this.prisma = prisma;
  }

  /**
   * Index blocks from start to end
   * Processes both native transfers and ERC-20 events
   */
  async indexBlocks(startBlock: number, endBlock: number): Promise<number> {
    let indexed = 0;

    for (let blockNumber = startBlock; blockNumber <= endBlock; blockNumber++) {
      try {
        await this.indexBlock(blockNumber);
        indexed++;

        if (indexed % 10 === 0) {
          console.log(`Indexed ${indexed} blocks (current: ${blockNumber})`);
        }
      } catch (error) {
        console.error(`Error indexing block ${blockNumber}:`, error);
        throw error;
      }
    }

    return indexed;
  }

  /**
   * Index a single block
   */
  private async indexBlock(blockNumber: number): Promise<void> {
    const block = await this.provider.getBlock(blockNumber, true);
    
    if (!block) {
      throw new Error(`Block ${blockNumber} not found`);
    }

    // Get watched addresses from env
    const watchedAddresses = this.getWatchedAddresses();

    // Process transactions
    for (const tx of block.prefetchedTransactions) {
      await this.processTransaction(tx, block, watchedAddresses);
    }

    // Process ERC-20 events
    await this.processERC20Events(blockNumber, watchedAddresses);
  }

  /**
   * Process native ETH transaction
   */
  private async processTransaction(
    tx: any,
    block: any,
    watchedAddresses: Set<string>,
  ): Promise<void> {
    const from = tx.from?.toLowerCase();
    const to = tx.to?.toLowerCase();
    const value = tx.value ? parseFloat(ethers.formatEther(tx.value)) : 0;

    // Skip if no value or not involving watched addresses
    if (value === 0 || (!watchedAddresses.has(from) && !watchedAddresses.has(to))) {
      return;
    }

    // Get receipt for gas used
    const receipt = await tx.wait();
    const gasUsed = receipt ? parseFloat(ethers.formatEther(receipt.gasUsed * tx.gasPrice)) : 0;

    await this.prisma.blockchainEvent.create({
      data: {
        chain: 'ethereum',
        network: this.network,
        txHash: tx.hash,
        blockNumber: BigInt(block.number),
        blockTimestamp: new Date(block.timestamp * 1000),
        logIndex: 0,
        eventType: 'transfer',
        from,
        to: to || '',
        asset: 'ETH',
        tokenAddress: null,
        quantity: value,
        feeAmount: gasUsed,
        feeCurrency: 'ETH',
        processed: false,
      },
    });
  }

  /**
   * Process ERC-20 transfer events
   */
  private async processERC20Events(
    blockNumber: number,
    watchedAddresses: Set<string>,
  ): Promise<void> {
    // Build filter for Transfer events
    const transferTopic = ethers.id(ERC20_TRANSFER_EVENT);
    
    const filters: Array<{ fromBlock: number; toBlock: number; topics: string[] }> = [];

    // Filter for outbound transfers (from watched addresses)
    for (const address of watchedAddresses) {
      filters.push({
        fromBlock: blockNumber,
        toBlock: blockNumber,
        topics: [
          transferTopic,
          ethers.zeroPadValue(address, 32), // from
        ],
      });

      // Filter for inbound transfers (to watched addresses)
      filters.push({
        fromBlock: blockNumber,
        toBlock: blockNumber,
        topics: [
          transferTopic,
          null, // any from
          ethers.zeroPadValue(address, 32), // to
        ],
      });
    }

    for (const filter of filters) {
      const logs = await this.provider.getLogs(filter);

      for (const log of logs) {
        await this.processERC20Log(log);
      }
    }
  }

  /**
   * Process single ERC-20 log
   */
  private async processERC20Log(log: ethers.Log): Promise<void> {
    // Check if already indexed
    const existing = await this.prisma.blockchainEvent.findUnique({
      where: {
        chain_network_txHash_logIndex: {
          chain: 'ethereum',
          network: this.network,
          txHash: log.transactionHash,
          logIndex: log.index,
        },
      },
    });

    if (existing) {
      return; // Already indexed
    }

    const contract = new ethers.Contract(log.address, ERC20_ABI, this.provider);

    try {
      const [decimals, symbol] = await Promise.all([
        contract.decimals(),
        contract.symbol(),
      ]);

      // Decode transfer event
      const iface = new ethers.Interface(ERC20_ABI);
      const decoded = iface.parseLog(log);

      if (!decoded) return;

      const from = decoded.args[0].toLowerCase();
      const to = decoded.args[1].toLowerCase();
      const value = decoded.args[2];

      const quantity = parseFloat(ethers.formatUnits(value, decimals));

      const block = await this.provider.getBlock(log.blockNumber);

      await this.prisma.blockchainEvent.create({
        data: {
          chain: 'ethereum',
          network: this.network,
          txHash: log.transactionHash,
          blockNumber: BigInt(log.blockNumber),
          blockTimestamp: new Date((block?.timestamp || 0) * 1000),
          logIndex: log.index,
          eventType: 'transfer',
          from,
          to,
          asset: symbol,
          tokenAddress: log.address.toLowerCase(),
          quantity,
          feeAmount: 0, // Fees tracked separately
          feeCurrency: 'ETH',
          processed: false,
        },
      });
    } catch (error) {
      console.error(`Error processing ERC-20 log ${log.transactionHash}:`, error);
    }
  }

  /**
   * Get watched addresses from environment
   */
  private getWatchedAddresses(): Set<string> {
    const addresses = process.env.OUR_WALLET_ADDRESSES || '';
    return new Set(
      addresses
        .split(',')
        .map(addr => addr.trim().toLowerCase())
        .filter(addr => addr.length > 0)
    );
  }

  /**
   * Get current block number
   */
  async getCurrentBlockNumber(): Promise<number> {
    return await this.provider.getBlockNumber();
  }

  /**
   * Get last indexed block from database
   */
  async getLastIndexedBlock(): Promise<number> {
    const lastEvent = await this.prisma.blockchainEvent.findFirst({
      where: {
        chain: 'ethereum',
        network: this.network,
      },
      orderBy: { blockNumber: 'desc' },
    });

    if (!lastEvent) {
      // Return start block from env
      return parseInt(process.env.ETH_START_BLOCK || '18000000', 10);
    }

    return Number(lastEvent.blockNumber);
  }
}
