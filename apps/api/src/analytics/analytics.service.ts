import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SnapshotBuilder } from '@crypto-ledger/analytics/duckdb/snapshot-builder';
import { DuckDBManager } from '@crypto-ledger/analytics/duckdb/duckdb-manager';
import { AnomalyDetector } from '@crypto-ledger/analytics/anomaly/anomaly-detector';
import { FinancialMetricsCalculator } from '@crypto-ledger/analytics/metrics/financial-metrics';

/**
 * Analytics service
 */
@Injectable()
export class AnalyticsService {
  private duckdb: DuckDBManager;
  private anomalyDetector: AnomalyDetector;
  private metricsCalculator: FinancialMetricsCalculator;

  constructor(private prisma: PrismaService) {
    this.duckdb = new DuckDBManager();
    this.anomalyDetector = new AnomalyDetector(this.prisma);
    this.metricsCalculator = new FinancialMetricsCalculator(this.prisma);
  }

  /**
   * Create DuckDB snapshot
   */
  async createSnapshot(asOfDate: Date, userId?: string) {
    const builder = new SnapshotBuilder(this.prisma, this.duckdb);
    const result = await builder.buildSnapshot(asOfDate);

    const snapshot = await this.prisma.columnarSnapshot.create({
      data: {
        asOfDate,
        recordCount: result.recordCount,
        duckdbPath: result.dbPath,
        fileSize: BigInt(result.fileSize),
        createdBy: userId,
      },
    });

    return snapshot;
  }

  /**
   * List snapshots
   */
  async listSnapshots() {
    return this.prisma.columnarSnapshot.findMany({
      orderBy: { asOfDate: 'desc' },
      take: 50,
    });
  }

  /**
   * Detect anomalies
   */
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

  /**
   * Get anomalies
   */
  async getAnomalies(status?: string, severity?: string) {
    return this.prisma.anomaly.findMany({
      where: {
        status,
        severity,
      },
      orderBy: { detectedAt: 'desc' },
      take: 100,
    });
  }

  /**
   * Calculate financial metrics
   */
  async calculateMetrics(asOfDate: Date) {
    const metrics = await this.metricsCalculator.calculateMetrics(asOfDate);

    // Store metrics
    await this.prisma.financialMetric.upsert({
      where: {
        metricType_period_asOfDate: {
          metricType: 'burn_rate',
          period: 'monthly',
          asOfDate,
        },
      },
      update: {
        value: metrics.burnRate.monthly,
      },
      create: {
        metricType: 'burn_rate',
        period: 'monthly',
        asOfDate,
        value: metrics.burnRate.monthly,
      },
    });

    return metrics;
  }
}
