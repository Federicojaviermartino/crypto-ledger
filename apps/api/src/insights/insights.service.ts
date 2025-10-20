import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AnomalyDetector } from '@crypto-ledger/analytics/anomaly/anomaly-detector';
import { FinancialMetricsCalculator } from '@crypto-ledger/analytics/metrics/financial-metrics';

@Injectable()
export class InsightsService {
  private anomalyDetector: AnomalyDetector;
  private metricsCalculator: FinancialMetricsCalculator;

  constructor(private prisma: PrismaService) {
    this.anomalyDetector = new AnomalyDetector(prisma);
    this.metricsCalculator = new FinancialMetricsCalculator(prisma);
  }

  async detectAnomalies(startDate: Date, endDate: Date) {
    const result = await this.anomalyDetector.detectAnomalies({ startDate, endDate });

    // Store anomalies
    for (const anomaly of result.anomalies) {
      await this.prisma.anomaly.create({
        data: {
          type: anomaly.type,
          severity: anomaly.severity,
          title: anomaly.title,
          description: anomaly.description,
          resourceType: anomaly.resourceType,
          resourceId: anomaly.resourceId,
          metrics: anomaly.metrics,
        },
      });
    }

    return result;
  }

  async getAnomalies(params: {
    status?: string;
    severity?: string;
    type?: string;
    limit?: number;
  }) {
    const { status, severity, type, limit = 100 } = params;

    return this.prisma.anomaly.findMany({
      where: {
        status,
        severity,
        type,
      },
      orderBy: { detectedAt: 'desc' },
      take: limit,
    });
  }

  async resolveAnomaly(anomalyId: string, userId: string, resolution: string) {
    return this.prisma.anomaly.update({
      where: { id: anomalyId },
      data: {
        status: 'resolved',
        resolvedAt: new Date(),
        resolvedBy: userId,
        resolution,
      },
    });
  }

  async calculateMetrics(asOfDate: Date) {
    const metrics = await this.metricsCalculator.calculateMetrics(asOfDate);

    // Store metrics
    await this.metricsCalculator.storeMetric({
      metricType: 'burn_rate',
      period: 'monthly',
      asOfDate,
      value: metrics.burnRate.monthly,
    });

    await this.metricsCalculator.storeMetric({
      metricType: 'cash_position',
      period: 'daily',
      asOfDate,
      value: metrics.cashPosition.current,
    });

    return metrics;
  }

  async getMetricHistory(metricType: string, days: number = 90) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    return this.prisma.financialMetric.findMany({
      where: {
        metricType,
        asOfDate: { gte: startDate },
      },
      orderBy: { asOfDate: 'asc' },
    });
  }
}
