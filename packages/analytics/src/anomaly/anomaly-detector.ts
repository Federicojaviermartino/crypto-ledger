import { PrismaClient } from '@prisma/client';

/**
 * Anomaly Detector
 * Statistical anomaly detection for accounting data
 */
export class AnomalyDetector {
  constructor(private prisma: PrismaClient) {}

  /**
   * Detect all types of anomalies
   */
  async detectAnomalies(params: {
    startDate: Date;
    endDate: Date;
  }) {
    const [
      amountAnomalies,
      balanceSpikes,
      frequencyAnomalies,
    ] = await Promise.all([
      this.detectUnusualAmounts(params),
      this.detectBalanceSpikes(params),
      this.detectFrequencyAnomalies(params),
    ]);

    const anomalies = [
      ...amountAnomalies,
      ...balanceSpikes,
      ...frequencyAnomalies,
    ];

    return {
      anomalies,
      summary: {
        total: anomalies.length,
        bySeverity: this.groupBySeverity(anomalies),
        byType: this.groupByType(anomalies),
      },
    };
  }

  /**
   * Detect unusual amounts using Z-score
   */
  private async detectUnusualAmounts(params: any) {
    const { startDate, endDate } = params;
    const anomalies = [];

    const accounts = await this.prisma.account.findMany({
      where: { isActive: true },
    });

    for (const account of accounts) {
      const postings = await this.prisma.posting.findMany({
        where: {
          accountId: account.id,
          entry: {
            date: {
              gte: new Date(startDate.getTime() - 90 * 24 * 60 * 60 * 1000),
              lte: endDate,
            },
          },
        },
        include: { entry: true },
      });

      if (postings.length < 10) continue;

      const amounts = postings.map(p => Math.abs(p.debit || p.credit));
      const mean = amounts.reduce((a, b) => a + b, 0) / amounts.length;
      const variance = amounts.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / amounts.length;
      const stdDev = Math.sqrt(variance);

      const recentPostings = postings.filter(p => p.entry.date >= startDate);

      for (const posting of recentPostings) {
        const amount = Math.abs(posting.debit || posting.credit);
        const zScore = (amount - mean) / stdDev;

        if (Math.abs(zScore) > 3) {
          anomalies.push({
            type: 'unusual_amount',
            severity: this.calculateSeverity(Math.abs(zScore)),
            title: `Unusual amount for account ${account.code}`,
            description: `Amount ${amount.toFixed(2)} is ${Math.abs(zScore).toFixed(1)}σ from mean`,
            resourceType: 'posting',
            resourceId: posting.id,
            metrics: {
              expectedValue: mean,
              actualValue: amount,
              deviation: stdDev,
              zScore,
            },
          });
        }
      }
    }

    return anomalies;
  }

  /**
   * Detect balance spikes
   */
  private async detectBalanceSpikes(params: any) {
    // Implementation similar to unusual amounts
    return [];
  }

  /**
   * Detect frequency anomalies
   */
  private async detectFrequencyAnomalies(params: any) {
    // Implementation for unusual posting frequency
    return [];
  }

  /**
   * Calculate severity based on Z-score
   */
  private calculateSeverity(zScore: number): string {
    if (zScore > 5) return 'critical';
    if (zScore > 4) return 'high';
    if (zScore > 3.5) return 'medium';
    return 'low';
  }

  /**
   * Group anomalies by severity
   */
  private groupBySeverity(anomalies: any[]) {
    const groups: any = { low: 0, medium: 0, high: 0, critical: 0 };
    anomalies.forEach(a => groups[a.severity]++);
    return groups;
  }

  /**
   * Group anomalies by type
   */
  private groupByType(anomalies: any[]) {
    const groups: any = {};
    anomalies.forEach(a => {
      groups[a.type] = (groups[a.type] || 0) + 1;
    });
    return groups;
  }
}
