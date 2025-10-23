import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ChainAdapterDispatcher } from '@crypto-ledger/crypto/chains/dispatcher';
import { BullMQService } from '../services/bullmq.service';

interface RegisterWalletDto {
  address: string;
  chain: string;
  network: string;
  label?: string;
  tags?: string[];
}

interface WalletFilters {
  chain?: string;
  network?: string;
  label?: string;
  page?: number;
  limit?: number;
}

interface SyncWalletDto {
  fullSync?: boolean;
  fromBlock?: bigint;
}

/**
 * REST API for wallet management
 * - Register new wallets for tracking
 * - List wallets with filtering
 * - Get current balances across all assets
 * - Trigger on-demand sync jobs
 */
@Controller('wallets')
@UseGuards(JwtAuthGuard)
export class WalletsController {
  private readonly logger = new Logger(WalletsController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly dispatcher: ChainAdapterDispatcher,
    private readonly bullmq: BullMQService,
  ) {}

  /**
   * POST /wallets - Register a new wallet for tracking
   * 
   * @example
   * POST /wallets
   * {
   *   "address": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
   *   "chain": "ethereum",
   *   "network": "mainnet",
   *   "label": "Treasury Hot Wallet",
   *   "tags": ["treasury", "hot"]
   * }
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async registerWallet(@Body() dto: RegisterWalletDto) {
    this.logger.log(`Registering wallet ${dto.address} on ${dto.chain}/${dto.network}`);

    // Validate chain and network exist
    const network = await this.prisma.network.findFirst({
      where: {
        chain: { name: dto.chain },
        name: dto.network,
      },
      include: { chain: true },
    });

    if (!network) {
      throw new Error(`Network ${dto.chain}/${dto.network} not found`);
    }

    // Validate address format based on chain
    const adapter = this.dispatcher.getAdapter(dto.chain as any);
    if (!adapter) {
      throw new Error(`Chain ${dto.chain} not supported`);
    }

    // Create wallet
    const wallet = await this.prisma.wallet.create({
      data: {
        address: dto.address,
        networkId: network.id,
        label: dto.label,
        tags: dto.tags || [],
        lastSyncedBlock: null,
        lastSyncedAt: null,
      },
      include: {
        network: {
          include: { chain: true },
        },
      },
    });

    // Trigger initial sync job
    await this.bullmq.addSyncJob({
      walletId: wallet.id,
      chain: dto.chain,
      network: dto.network,
      address: dto.address,
      fullSync: true,
    });

    return {
      id: wallet.id,
      address: wallet.address,
      chain: dto.chain,
      network: dto.network,
      label: wallet.label,
      tags: wallet.tags,
      syncJobQueued: true,
      createdAt: wallet.createdAt,
    };
  }

  /**
   * GET /wallets - List all registered wallets with filtering
   * 
   * @example
   * GET /wallets?chain=ethereum&network=mainnet&page=1&limit=50
   */
  @Get()
  async listWallets(@Query() filters: WalletFilters) {
    const page = filters.page || 1;
    const limit = Math.min(filters.limit || 50, 100);
    const skip = (page - 1) * limit;

    const where: any = {};
    if (filters.chain || filters.network) {
      where.network = {};
      if (filters.chain) {
        where.network.chain = { name: filters.chain };
      }
      if (filters.network) {
        where.network.name = filters.network;
      }
    }
    if (filters.label) {
      where.label = { contains: filters.label, mode: 'insensitive' };
    }

    const [wallets, total] = await Promise.all([
      this.prisma.wallet.findMany({
        where,
        include: {
          network: {
            include: { chain: true },
          },
        },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.wallet.count({ where }),
    ]);

    return {
      data: wallets.map((w) => ({
        id: w.id,
        address: w.address,
        chain: w.network.chain.name,
        network: w.network.name,
        label: w.label,
        tags: w.tags,
        lastSyncedBlock: w.lastSyncedBlock?.toString(),
        lastSyncedAt: w.lastSyncedAt,
        createdAt: w.createdAt,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * GET /wallets/:id/balances - Get current balances for a wallet
   * Aggregates across all assets (native + tokens)
   * 
   * @example
   * GET /wallets/cuid123/balances
   * Response:
   * {
   *   "walletId": "cuid123",
   *   "address": "0x742d35Cc...",
   *   "chain": "ethereum",
   *   "balances": [
   *     { "asset": "ETH", "balance": "10.5", "usdValue": "31500.00" },
   *     { "asset": "USDC", "balance": "50000.00", "usdValue": "50000.00" }
   *   ],
   *   "totalUsdValue": "81500.00",
   *   "asOf": "2025-10-23T12:00:00Z"
   * }
   */
  @Get(':id/balances')
  async getWalletBalances(@Param('id') walletId: string) {
    const wallet = await this.prisma.wallet.findUnique({
      where: { id: walletId },
      include: {
        network: {
          include: { chain: true },
        },
      },
    });

    if (!wallet) {
      throw new Error(`Wallet ${walletId} not found`);
    }

    const adapter = this.dispatcher.getAdapter(wallet.network.chain.name as any);
    if (!adapter) {
      throw new Error(`Chain ${wallet.network.chain.name} not supported`);
    }

    // Get current on-chain balances
    const balances = await adapter.currentBalance(wallet.address);

    // Fetch latest USD prices
    const assetSymbols = balances.map((b) => b.asset);
    const prices = await this.prisma.price.findMany({
      where: {
        asset: { symbol: { in: assetSymbols } },
        timestamp: {
          gte: new Date(Date.now() - 3600_000), // Last hour
        },
      },
      orderBy: { timestamp: 'desc' },
      distinct: ['assetId'],
    });

    const priceMap = new Map(
      prices.map((p) => [p.asset.symbol, parseFloat(p.priceUsd)]),
    );

    const enrichedBalances = balances.map((b) => {
      const priceUsd = priceMap.get(b.asset) || 0;
      const usdValue = parseFloat(b.balance) * priceUsd;
      return {
        asset: b.asset,
        balance: b.balance,
        usdValue: usdValue.toFixed(2),
      };
    });

    const totalUsdValue = enrichedBalances.reduce(
      (sum, b) => sum + parseFloat(b.usdValue),
      0,
    );

    return {
      walletId: wallet.id,
      address: wallet.address,
      chain: wallet.network.chain.name,
      network: wallet.network.name,
      balances: enrichedBalances,
      totalUsdValue: totalUsdValue.toFixed(2),
      asOf: new Date().toISOString(),
    };
  }

  /**
   * POST /wallets/:id/sync - Trigger on-demand sync for a wallet
   * 
   * @example
   * POST /wallets/cuid123/sync
   * { "fullSync": false, "fromBlock": "18000000" }
   */
  @Post(':id/sync')
  @HttpCode(HttpStatus.ACCEPTED)
  async syncWallet(@Param('id') walletId: string, @Body() dto: SyncWalletDto) {
    const wallet = await this.prisma.wallet.findUnique({
      where: { id: walletId },
      include: {
        network: {
          include: { chain: true },
        },
      },
    });

    if (!wallet) {
      throw new Error(`Wallet ${walletId} not found`);
    }

    this.logger.log(`Triggering sync for wallet ${wallet.address} on ${wallet.network.chain.name}`);

    // Create sync job
    const job = await this.bullmq.addSyncJob({
      walletId: wallet.id,
      chain: wallet.network.chain.name,
      network: wallet.network.name,
      address: wallet.address,
      fullSync: dto.fullSync || false,
      fromBlock: dto.fromBlock,
    });

    return {
      message: 'Sync job queued',
      jobId: job.id,
      walletId: wallet.id,
      address: wallet.address,
      fullSync: dto.fullSync || false,
    };
  }
}
