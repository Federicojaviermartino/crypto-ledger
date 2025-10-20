export type AnomalyType = 
  | 'unusual_amount' 
  | 'balance_spike' 
  | 'frequency_anomaly' 
  | 'pattern_break'
  | 'duplicate_suspect';

export type AnomalySeverity = 'low' | 'medium' | 'high' | 'critical';

export interface AnomalyDetectionResult {
  anomalies: Array<{
    type: AnomalyType;
    severity: AnomalySeverity;
    title: string;
    description: string;
    resourceId: string;
    metrics: {
      expectedValue?: number;
      actualValue: number;
      deviation?: number;
      zScore?: number;
    };
  }>;
  summary: {
    total: number;
    bySeverity: Record<AnomalySeverity, number>;
    byType: Record<AnomalyType, number>;
  };
}

export interface FinancialMetrics {
  burnRate: {
    daily: number;
    monthly: number;
    trend: 'increasing' | 'decreasing' | 'stable';
  };
  runway: {
    months: number;
    projectedRunoutDate: Date;
  };
  cashPosition: {
    current: number;
    change30d: number;
    changePercent: number;
  };
  revenueMetrics: {
    mtd: number;
    lastMonth: number;
    growth: number;
  };
  pnl: {
    netIncome: number;
    grossMargin: number;
    operatingMargin: number;
  };
}
