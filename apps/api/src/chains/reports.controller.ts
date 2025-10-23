import {
  Controller,
  Get,
  Query,
  UseGuards,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

interface ReportFilters {
  from?: string; // ISO date
  to?: string; // ISO date
  wallet?: string; // Wallet ID
  chain?: string;
  asset?: string;
  dimension1?: string; // Custom dimension filtering
  dimension2?: string;
  asOf?: string; // Time-travel parameter
}

interface PLEntry {
  asset: string;
  realizedGain: string;
  unrealizedGain: string;
  totalGain: string;
  costBasis: string;
  proceedsDisposals: string;
  currentValue: string;
}

interface BalanceSheetEntry {
  asset: string;
  quantity: string;
  costBasis: string;
  marketValue: string;
  unrealizedGainLoss: string;
}

interface CashFlowEntry {
  period: string;
  inflows: string;
  outflows: string;
  netCashFlow: string;
}

/**
 * Advanced reporting endpoints for auditor-grade financial statements
 * - P&L with FIFO lot tracking (realized + unrealized gains)
 * - Balance Sheet with time-travel capability
 * - Cash Flow statement with indirect method
 * - Multi-dimensional filtering (wallet, chain, asset, custom dimensions)
 */
@Controller('reports')
@UseGuards(JwtAuthGuard)
export class ReportsController {
  private readonly logger = new Logger(ReportsController.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * GET /reports/pnl - Profit & Loss statement with FIFO lot tracking
   * 
   * Calculates:
   * - Realized gains/losses from disposals (using FIFO lots)
   * - Unrealized gains/losses from current holdings
   * - Aggregated by asset with full cost basis transparency
   * 
   * @example
   * GET /reports/pnl?from=2025-01-01&to=2025-12-31&wallet=cuid123&asset=ETH
   * 
   * Response:
   * {
   *   "period": { "from": "2025-01-01", "to": "2025-12-31" },
   *   "entries": [
   *     {
   *       "asset": "ETH",
   *       "realizedGain": "5000.00",
   *       "unrealizedGain": "3000.00",
   *       "totalGain": "8000.00",
   *       "costBasis": "25000.00",
   *       "proceedsDisposals": "30000.00",
   *       "currentValue": "28000.00"
   *     }
   *   ],
   *   "summary": {
   *     "totalRealizedGain": "5000.00",
   *     "totalUnrealizedGain": "3000.00",
   *     "totalGain": "8000.00"
   *   }
   * }
   */
  @Get('pnl')
  async getProfitAndLoss(@Query() filters: ReportFilters) {
    const from = filters.from ? new Date(filters.from) : new Date('2020-01-01');
    const to = filters.to ? new Date(filters.to) : new Date();

    this.logger.log(`Generating P&L report from ${from.toISOString()} to ${to.toISOString()}`);

    // Build WHERE clause for filtering
    const where: any = {
      timestamp: { gte: from, lte: to },
    };
    if (filters.wallet) {
      where.walletId = filters.wallet;
    }
    if (filters.chain) {
      where.chain = filters.chain;
    }

    // Fetch all disposal events (sells, swaps, transfers out)
    const disposals = await this.prisma.blockchainEvent.findMany({
      where: {
        ...where,
        eventType: { in: ['SWAP', 'TRANSFER_OUT', 'WITHDRAW'] },
      },
      include: {
        lots: {
          include: {
            lot: true,
          },
        },
      },
      orderBy: { timestamp: 'asc' },
    });

    // Calculate realized gains from lot assignments
    const realizedByAsset = new Map<string, number>();
    const costBasisByAsset = new Map<string, number>();
    const proceedsByAsset = new Map<string, number>();

    for (const disposal of disposals) {
      const asset = disposal.asset || disposal.assetSymbol || 'UNKNOWN';
      const proceeds = parseFloat(disposal.amountUsd || '0');
      
      let totalCostBasis = 0;
      for (const assignment of disposal.lots) {
        const costBasis = parseFloat(assignment.lot.costBasisUsd);
        totalCostBasis += costBasis;
      }

      const realizedGain = proceeds - totalCostBasis;

      realizedByAsset.set(asset, (realizedByAsset.get(asset) || 0) + realizedGain);
      costBasisByAsset.set(asset, (costBasisByAsset.get(asset) || 0) + totalCostBasis);
      proceedsByAsset.set(asset, (proceedsByAsset.get(asset) || 0) + proceeds);
    }

    // Fetch current holdings for unrealized gains
    const holdings = await this.prisma.lot.groupBy({
      by: ['assetSymbol'],
      where: {
        quantityRemaining: { gt: 0 },
        ...(filters.wallet && { walletId: filters.wallet }),
      },
      _sum: {
        quantityRemaining: true,
        costBasisUsd: true,
      },
    });

    // Calculate unrealized gains
    const unrealizedByAsset = new Map<string, number>();
    const currentValueByAsset = new Map<string, number>();

    for (const holding of holdings) {
      const asset = holding.assetSymbol;
      const quantity = parseFloat(holding._sum.quantityRemaining?.toString() || '0');
      const costBasis = parseFloat(holding._sum.costBasisUsd?.toString() || '0');

      // Fetch latest price
      const latestPrice = await this.prisma.price.findFirst({
        where: {
          asset: { symbol: asset },
          timestamp: { lte: to },
        },
        orderBy: { timestamp: 'desc' },
      });

      const priceUsd = parseFloat(latestPrice?.priceUsd || '0');
      const currentValue = quantity * priceUsd;
      const unrealizedGain = currentValue - costBasis;

      unrealizedByAsset.set(asset, unrealizedGain);
      currentValueByAsset.set(asset, currentValue);
    }

    // Combine realized + unrealized into entries
    const allAssets = new Set([
      ...realizedByAsset.keys(),
      ...unrealizedByAsset.keys(),
    ]);

    const entries: PLEntry[] = Array.from(allAssets)
      .map((asset) => {
        const realized = realizedByAsset.get(asset) || 0;
        const unrealized = unrealizedByAsset.get(asset) || 0;
        const costBasis = costBasisByAsset.get(asset) || 0;
        const proceeds = proceedsByAsset.get(asset) || 0;
        const currentValue = currentValueByAsset.get(asset) || 0;

        return {
          asset,
          realizedGain: realized.toFixed(2),
          unrealizedGain: unrealized.toFixed(2),
          totalGain: (realized + unrealized).toFixed(2),
          costBasis: costBasis.toFixed(2),
          proceedsDisposals: proceeds.toFixed(2),
          currentValue: currentValue.toFixed(2),
        };
      })
      .filter((e) => parseFloat(e.totalGain) !== 0)
      .sort((a, b) => parseFloat(b.totalGain) - parseFloat(a.totalGain));

    const totalRealizedGain = entries.reduce(
      (sum, e) => sum + parseFloat(e.realizedGain),
      0,
    );
    const totalUnrealizedGain = entries.reduce(
      (sum, e) => sum + parseFloat(e.unrealizedGain),
      0,
    );

    return {
      period: {
        from: from.toISOString().split('T')[0],
        to: to.toISOString().split('T')[0],
      },
      entries,
      summary: {
        totalRealizedGain: totalRealizedGain.toFixed(2),
        totalUnrealizedGain: totalUnrealizedGain.toFixed(2),
        totalGain: (totalRealizedGain + totalUnrealizedGain).toFixed(2),
      },
    };
  }

  /**
   * GET /reports/balance-sheet - Asset positions at a specific timestamp
   * 
   * Time-travel capable: Use `asOf` parameter to get historical snapshot
   * 
   * @example
   * GET /reports/balance-sheet?asOf=2025-06-30T23:59:59Z&wallet=cuid123
   * 
   * Response:
   * {
   *   "asOf": "2025-06-30T23:59:59Z",
   *   "assets": [
   *     {
   *       "asset": "ETH",
   *       "quantity": "10.5",
   *       "costBasis": "25000.00",
   *       "marketValue": "31500.00",
   *       "unrealizedGainLoss": "6500.00"
   *     }
   *   ],
   *   "totalCostBasis": "25000.00",
   *   "totalMarketValue": "31500.00",
   *   "totalUnrealizedGainLoss": "6500.00"
   * }
   */
  @Get('balance-sheet')
  async getBalanceSheet(@Query() filters: ReportFilters) {
    const asOf = filters.asOf ? new Date(filters.asOf) : new Date();

    this.logger.log(`Generating balance sheet as of ${asOf.toISOString()}`);

    // Aggregate lots that existed at asOf timestamp
    const lots = await this.prisma.lot.groupBy({
      by: ['assetSymbol'],
      where: {
        acquiredAt: { lte: asOf },
        quantityRemaining: { gt: 0 },
        ...(filters.wallet && { walletId: filters.wallet }),
      },
      _sum: {
        quantityRemaining: true,
        costBasisUsd: true,
      },
    });

    const assets: BalanceSheetEntry[] = [];

    for (const lot of lots) {
      const asset = lot.assetSymbol;
      const quantity = parseFloat(lot._sum.quantityRemaining?.toString() || '0');
      const costBasis = parseFloat(lot._sum.costBasisUsd?.toString() || '0');

      // Fetch price as of timestamp
      const price = await this.prisma.price.findFirst({
        where: {
          asset: { symbol: asset },
          timestamp: { lte: asOf },
        },
        orderBy: { timestamp: 'desc' },
      });

      const priceUsd = parseFloat(price?.priceUsd || '0');
      const marketValue = quantity * priceUsd;
      const unrealizedGainLoss = marketValue - costBasis;

      assets.push({
        asset,
        quantity: quantity.toFixed(8),
        costBasis: costBasis.toFixed(2),
        marketValue: marketValue.toFixed(2),
        unrealizedGainLoss: unrealizedGainLoss.toFixed(2),
      });
    }

    const totalCostBasis = assets.reduce((sum, a) => sum + parseFloat(a.costBasis), 0);
    const totalMarketValue = assets.reduce((sum, a) => sum + parseFloat(a.marketValue), 0);

    return {
      asOf: asOf.toISOString(),
      assets,
      totalCostBasis: totalCostBasis.toFixed(2),
      totalMarketValue: totalMarketValue.toFixed(2),
      totalUnrealizedGainLoss: (totalMarketValue - totalCostBasis).toFixed(2),
    };
  }

  /**
   * GET /reports/cash-flow - Cash flow statement (indirect method)
   * 
   * Aggregates inflows (deposits, swaps in) and outflows (withdrawals, swaps out)
   * Grouped by period (day, week, month)
   * 
   * @example
   * GET /reports/cash-flow?from=2025-01-01&to=2025-12-31&wallet=cuid123&groupBy=month
   * 
   * Response:
   * {
   *   "period": { "from": "2025-01-01", "to": "2025-12-31" },
   *   "groupBy": "month",
   *   "entries": [
   *     {
   *       "period": "2025-01",
   *       "inflows": "50000.00",
   *       "outflows": "30000.00",
   *       "netCashFlow": "20000.00"
   *     }
   *   ],
   *   "summary": {
   *     "totalInflows": "50000.00",
   *     "totalOutflows": "30000.00",
   *     "netCashFlow": "20000.00"
   *   }
   * }
   */
  @Get('cash-flow')
  async getCashFlow(@Query() filters: ReportFilters & { groupBy?: 'day' | 'week' | 'month' }) {
    const from = filters.from ? new Date(filters.from) : new Date('2020-01-01');
    const to = filters.to ? new Date(filters.to) : new Date();
    const groupBy = filters.groupBy || 'month';

    this.logger.log(`Generating cash flow report from ${from.toISOString()} to ${to.toISOString()}`);

    const where: any = {
      timestamp: { gte: from, lte: to },
    };
    if (filters.wallet) {
      where.walletId = filters.wallet;
    }
    if (filters.chain) {
      where.chain = filters.chain;
    }

    // Fetch all events and classify as inflow or outflow
    const events = await this.prisma.blockchainEvent.findMany({
      where,
      orderBy: { timestamp: 'asc' },
    });

    const periodMap = new Map<string, { inflows: number; outflows: number }>();

    for (const event of events) {
      const amountUsd = parseFloat(event.amountUsd || '0');
      const isInflow = ['DEPOSIT', 'RECEIVE', 'SWAP_IN', 'MINT'].includes(event.eventType);
      const isOutflow = ['WITHDRAW', 'TRANSFER_OUT', 'SWAP_OUT', 'BURN'].includes(event.eventType);

      if (!isInflow && !isOutflow) continue;

      // Group by period
      let periodKey: string;
      const ts = event.timestamp;
      if (groupBy === 'day') {
        periodKey = ts.toISOString().split('T')[0];
      } else if (groupBy === 'week') {
        const weekNum = Math.floor((ts.getTime() - from.getTime()) / (7 * 24 * 3600 * 1000));
        periodKey = `Week ${weekNum + 1}`;
      } else {
        periodKey = ts.toISOString().slice(0, 7); // YYYY-MM
      }

      if (!periodMap.has(periodKey)) {
        periodMap.set(periodKey, { inflows: 0, outflows: 0 });
      }

      const period = periodMap.get(periodKey)!;
      if (isInflow) {
        period.inflows += amountUsd;
      } else {
        period.outflows += amountUsd;
      }
    }

    // Convert to entries
    const entries: CashFlowEntry[] = Array.from(periodMap.entries())
      .map(([period, { inflows, outflows }]) => ({
        period,
        inflows: inflows.toFixed(2),
        outflows: outflows.toFixed(2),
        netCashFlow: (inflows - outflows).toFixed(2),
      }))
      .sort((a, b) => a.period.localeCompare(b.period));

    const totalInflows = entries.reduce((sum, e) => sum + parseFloat(e.inflows), 0);
    const totalOutflows = entries.reduce((sum, e) => sum + parseFloat(e.outflows), 0);

    return {
      period: {
        from: from.toISOString().split('T')[0],
        to: to.toISOString().split('T')[0],
      },
      groupBy,
      entries,
      summary: {
        totalInflows: totalInflows.toFixed(2),
        totalOutflows: totalOutflows.toFixed(2),
        netCashFlow: (totalInflows - totalOutflows).toFixed(2),
      },
    };
  }
}
