export interface BankAccountInfo {
  accountNumber: string;
  iban?: string;
  bic?: string;
  bankName: string;
  currency: string;
  glAccountCode: string;
}

export interface BankTransactionImport {
  transactionDate: string;
  valueDate?: string;
  amount: number;
  currency: string;
  counterpartyName?: string;
  counterpartyAccount?: string;
  description: string;
  referenceNumber?: string;
  transactionType?: 'credit' | 'debit';
}

export interface ReconciliationCandidate {
  bankTransactionId: string;
  postingId: string;
  confidence: number;
  matchReasons: string[];
  posting: {
    entryId: string;
    date: Date;
    description: string;
    amount: number;
    accountCode: string;
  };
}

export interface ReconciliationResult {
  bankTransactionId: string;
  matched: boolean;
  matchType: 'exact' | 'fuzzy' | 'manual';
  postings: string[];
  journalEntryId?: string;
  adjustmentAmount?: number;
}

export interface ReconciliationSummary {
  bankAccountId: string;
  period: { start: Date; end: Date };
  openingBalance: number;
  closingBalance: number;
  totalTransactions: number;
  reconciledCount: number;
  unreconciledCount: number;
  unreconciledAmount: number;
  adjustmentsNeeded: Array<{
    description: string;
    amount: number;
    suggestedAccount: string;
  }>;
}
