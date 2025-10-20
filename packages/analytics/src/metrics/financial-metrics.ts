import { PrismaClient } from '@prisma/client';

/**
 * Financial Metrics Calculator
 * Calculates KPIs: burn rate, runway, cash position, etc.
 */
export class FinancialMetricsCalculator {
  constructor(private prisma: PrismaClient) {}

  /**
   * Calculate all metrics
   */
  async calculateMetrics(asOfDate: Date) {
    const [
      burnRate,
      cashPosition,
      revenue,
    ] = await Promise.all([
      this.calculateBurnRate(asOfDate),
      this.calculateCashPosition(asOfDate),
      this.calculateRevenue(asOfDate),
    ]);

    const runway = this.calculateRunway(cashPosition.current, burnRate.monthly);

    return {
      burnRate,
      runway,
      cashPosition,
      revenueMetrics: revenue,
      asOfDate,
    };
  }

  /**
   * Calculate monthly burn rate
   */
  private async calculateBurnRate(asOfDate: Date) {
    const thirtyDaysAgo = new Date(asOfDate.getTime() - 30 * 24 * 60 * 60 * 1000);

    const expenseAccounts = await this.prisma.account.findMany({
      where: { type: 'expense' },
    });

    const expenses = await this.prisma.posting.findMany({
      where: {
        accountId: { in: expenseAccounts.map(a => a.id) },
        entry: {
          date: { gte: thirtyDaysAgo, lte: asOfDate },
        },
      },
    });

    const totalExpenses = expenses.reduce((sum, p) => sum + p.debit, 0);
    const dailyBurn = totalExpenses / 30;
    const monthlyBurn = dailyBurn * 30;

    return {
      daily: dailyBurn,
      monthly: monthlyBurn,
      trend: 'stable' as const,
    };
  }

  /**
   * Calculate cash position
   */
  private async calculateCashPosition(asOfDate: Date) {
    const cashAccounts = await this.prisma.account.findMany({
      where: {
        OR: [
          { code: { startsWith: '1000' } },
          { code: { startsWith: '1100' } },
        ],
      },
    });

    const postings = await this.prisma.posting.findMany({
      where: {
        accountId: { in: cashAccounts.map(a => a.id) },
        entry: { date: { lte: asOfDate } },
      },
    });

    const current = postings.reduce((sum, p) => sum + p.debit - p.credit, 0);

    return {
      current,
      change30d: 0,
      changePercent: 0,
    };
  }

  /**
   * Calculate revenue metrics
   */
  private async calculateRevenue(asOfDate: Date) {
    const monthStart = new Date(asOfDate.getFullYear(), asOfDate.getMonth(), 1);

    const revenueAccounts = await this.prisma.account.findMany({
      where: { type: 'revenue' },
    });

    const mtdPostings = await this.prisma.posting.findMany({
      where: {
        accountId: { in: revenueAccounts.map(a => a.id) },
        entry: {
          date: { gte: monthStart, lte: asOfDate },
        },
      },
    });

    const mtd = mtdPostings.reduce((sum, p) => sum + p.credit, 0);

    return {
      mtd,
      lastMonth: 0,
      growth: 0,
    };
  }

  /**
   * Calculate runway (months of cash remaining)
   */
  private calculateRunway(cash: number, monthlyBurn: number) {
    if (monthlyBurn <= 0) {
      return {
        months: Infinity,
        projectedRunoutDate: new Date(9999, 11, 31),
      };
    }

    const months = cash / monthlyBurn;
    const projectedRunoutDate = new Date();
    projectedRunoutDate.setMonth(projectedRunoutDate.getMonth() + Math.floor(months));

    return {
      months,
      projectedRunoutDate,
    };
  }
}
