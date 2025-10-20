export type LotSourceType = 'purchase' | 'mining' | 'staking' | 'airdrop' | 'transfer_in';

export interface CreateLotInput {
  asset: string;
  quantity: number;
  costBasis: number;
  acquisitionDate: Date;
  acquisitionTxHash?: string;
  sourceType: LotSourceType;
  sourceEventId?: string;
  journalEntryId?: string;
  metadata?: Record<string, unknown>;
}

export interface DisposeLotInput {
  asset: string;
  quantity: number;
  proceedsAmount: number;
  disposalDate: Date;
  disposalTxHash?: string;
  disposalEventId?: string;
  feeAmount?: number;
  method?: 'fifo' | 'lifo' | 'specific';
  metadata?: Record<string, unknown>;
}

export interface LotDisposalResult {
  disposals: Array<{
    lotId: string;
    quantityDisposed: number;
    costBasis: number;
    realizedPnL: number;
  }>;
  totalCostBasis: number;
  totalRealizedPnL: number;
  journalEntryId?: string;
}

export interface LotBalance {
  asset: string;
  totalQuantity: number;
  totalCostBasis: number;
  averageCostBasis: number;
  lotCount: number;
}

export interface RealizedPnLReport {
  asset?: string;
  period: {
    from: Date;
    to: Date;
  };
  disposals: Array<{
    date: Date;
    asset: string;
    quantity: number;
    proceeds: number;
    costBasis: number;
    realizedPnL: number;
    txHash?: string;
  }>;
  summary: {
    totalDisposals: number;
    totalProceeds: number;
    totalCostBasis: number;
    totalRealizedPnL: number;
    shortTermGains: number;
    longTermGains: number;
  };
}
