import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EthereumIndexer } from '@crypto-ledger/crypto/indexer/ethereum-indexer';
import { ClassificationEngine } from '@crypto-ledger/crypto/classification/classification-engine';
import { PriceService } from '@crypto-ledger/crypto/pricing/price-service';

/**
 * Service for blockchain operations
 */
@Injectable()
export class BlockchainService {
  private indexer: EthereumIndexer;
  private classificationEngine: ClassificationEngine;
  private priceService: PriceService;

  constructor(private prisma: PrismaService) {
    const rpcUrl = process.env.ETH_RPC_URL || 'https://ethereum.publicnode.com';
    const network = process.env.ETH_NETWORK || 'mainnet';

    this.indexer = new EthereumIndexer(rpcUrl, network, this.prisma);
    this.classificationEngine = new ClassificationEngine(this.prisma);
    this.priceService = new PriceService(this.prisma, process.env.COINGECKO_API_KEY);
  }

  /**
   * Get blockchain events with filters
   */
  async getEvents(params: {
    processed?: boolean;
    classifiedAs?: string;
    from?: string;
    to?: string;
    startDate?: Date;
    endDate?: Date;
    skip?: number;
    take?: number;
  }) {
    const where: any = {};

    if (params.processed !== undefined) where.processed = params.processed;
    if (params.classifiedAs) where.classifiedAs = params.classifiedAs;
    if (params.from) where.from = params.from.toLowerCase();
    if (params.to) where.to = params.to.toLowerCase();

    if (params.startDate || params.endDate) {
      where.blockTimestamp = {};
      if (params.startDate) where.blockTimestamp.gte = params.startDate;
      if (params.endDate) where.blockTimestamp.lte = params.endDate;
    }

    const [events, total] = await Promise.all([
      this.prisma.blockchainEvent.findMany({
        where,
        skip: params.skip || 0,
        take: params.take || 50,
        orderBy: { blockTimestamp: 'desc' },
      }),
      this.prisma.blockchainEvent.count({ where }),
    ]);

    return {
      events,
      pagination: {
        total,
        skip: params.skip || 0,
        take: params.take || 50,
      },
    };
  }

  /**
   * Get event by ID
   */
  async getEvent(id: string) {
    return this.prisma.blockchainEvent.findUnique({
      where: { id },
      include: {
        journalEntry: {
          include: {
            postings: {
              include: {
                account: true,
              },
            },
          },
        },
      },
    });
  }

  /**
   * Classify an event
   */
  async classifyEvent(id: string) {
    const classification = await this.classificationEngine.classifyEvent(id);
    return { id, classification };
  }

  /**
   * Get indexer status
   */
  async getStatus() {
    const lastEvent = await this.prisma.blockchainEvent.findFirst({
      orderBy: { blockNumber: 'desc' },
    });

    const currentBlock = await this.indexer.getCurrentBlockNumber();

    const [totalEvents, processedEvents, unclassifiedEvents] = await Promise.all([
      this.prisma.blockchainEvent.count(),
      this.prisma.blockchainEvent.count({ where: { processed: true } }),
      this.prisma.blockchainEvent.count({ where: { classifiedAs: 'unclassified' } }),
    ]);

    return {
      lastIndexedBlock: lastEvent ? Number(lastEvent.blockNumber) : null,
      currentChainBlock: currentBlock,
      blocksBehind: lastEvent ? currentBlock - Number(lastEvent.blockNumber) : null,
      totalEvents,
      processedEvents,
      unclassifiedEvents,
    };
  }

  /**
   * Get current price
   */
  async getCurrentPrice(asset: string, quote: string = 'USD') {
    return this.priceService.getCurrentPrice(asset, quote);
  }

  /**
   * Get historical price
   */
  async getHistoricalPrice(asset: string, quote: string, date: Date) {
    return this.priceService.getHistoricalPrice(asset, quote, date);
  }
}
