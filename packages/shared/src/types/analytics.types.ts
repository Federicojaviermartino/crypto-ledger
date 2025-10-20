export interface ColumnarSnapshot {
  id: string;
  asOfDate: Date;
  recordCount: number;
  duckdbPath: string;
  createdAt: Date;
}

export interface TrialBalanceRow {
  accountCode: string;
  accountName: string;
  accountType: string;
  debit: number;
  credit: number;
  balance: number;
  legalEntity?: string;
  costCenter?: string;
  project?: string;
  product?: string;
  wallet?: string;
  geography?: string;
  customKv?: string;
}

export interface AnalyticsQuery {
  asOfDate: Date;
  groupBy?: string[];
  filters?: Record<string, any>;
  orderBy?: string;
  limit?: number;
}

export interface AnalyticsResult {
  rows: any[];
  executionTimeMs: number;
  rowCount: number;
  fromCache: boolean;
}
