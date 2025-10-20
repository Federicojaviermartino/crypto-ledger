export type CheckStatus = 'pass' | 'fail' | 'warning';
export type IssueSeverity = 'blocker' | 'warning' | 'info';
export type IssueType = 
  | 'classification_gap' 
  | 'unreconciled' 
  | 'imbalance' 
  | 'missing_fx'
  | 'missing_dimension'
  | 'suspense_balance';

export interface CloseCheck {
  name: string;
  status: CheckStatus;
  message: string;
  details?: unknown;
}

export interface CloseIssue {
  id: string;
  period: string;
  issueType: IssueType;
  severity: IssueSeverity;
  title: string;
  description: string;
  affectedItems: Array<{
    type: string;
    id: string;
    reference?: string;
  }>;
  status: 'open' | 'resolved' | 'ignored';
}

export interface CloseHealthStatus {
  period: string;
  status: 'ready' | 'blocked' | 'warning';
  readyToClose: boolean;
  lastChecked: Date;
  checks: CloseCheck[];
  blockers: CloseIssue[];
  warnings: CloseIssue[];
  summary: {
    totalChecks: number;
    passed: number;
    failed: number;
    blockerCount: number;
    warningCount: number;
  };
}
