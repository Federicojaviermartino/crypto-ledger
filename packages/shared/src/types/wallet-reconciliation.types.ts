export interface WalletAccountInfo {
  address: string;
  chain: string;
  network: string;
  label?: string;
  glAccountCode: string;
  entityId?: string;
}

export interface OnChainBalance {
  asset: string;
  balance: number;
  blockNumber: bigint;
  timestamp: Date;
}

export interface BookBalance {
  asset: string;
  balance: number;
  asOfDate: Date;
  postingCount: number;
}

export interface WalletReconciliationResult {
  walletAccountId: string;
  address: string;
  asset: string;
  onChainBalance: number;
  bookBalance: number;
  variance: number;
  variancePercent: number;
  isWithinThreshold: boolean;
  threshold: number;
  status: string;
}

export interface ReconciliationAlert {
  walletAddress: string;
  asset: string;
  variance: number;
  variancePercent: number;
  message: string;
  severity: 'warning' | 'critical';
}
