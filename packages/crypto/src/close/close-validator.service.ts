import { PrismaClient } from '@prisma/client';
import { CloseCheck, CloseIssue, CloseHealthStatus } from '@crypto-ledger/shared/types/close.types';

export class CloseValidatorService {
  constructor(private prisma: PrismaClient) {}

  async validatePeriod(period: string): Promise<CloseHealthStatus> {
    const [year, month] = period.split('-').map(Number);
    const periodStart = new Date(year, month - 1, 1);
    const periodEnd = new Date(year, month, 0, 23, 59, 59, 999);

    const checks: CloseCheck[] = [];
    const blockers: CloseIssue[] = [];
    const warnings: CloseIssue[] = [];

    // Run all validation checks
    await Promise.all([
      this.checkClassificationGaps(periodStart, periodEnd, checks, blockers),
      this.checkUnreconciledItems(periodStart, periodEnd, checks, warnings),
      this.checkDimensionalBalance(periodStart, periodEnd, checks, blockers),
      this.checkEntityBalance(periodStart, periodEnd, checks, blockers),
      this.checkSuspenseAccounts(periodStart, periodEnd, checks, warnings),
      this.checkMissingFxRates(periodStart, periodEnd, checks, warnings),
    ]);

    const passed = checks.filter(c => c.status === 'pass').length;
    const failed = checks.filter(c => c.status === 'fail').length;

    const readyToClose = blockers.length === 0 && failed === 0;
    const status = blockers.length > 0 ? 'blocked' : warnings.length > 0 ? 'warning' : 'ready';

    // Store validation results
    await this.storeChecklistResults(period, status, checks, blockers, warnings);

    return {
      period,
      status,
      readyToClose,
      lastChecked: new Date(),
      checks,
      blockers,
      warnings,
      summary: {
        totalChecks: checks.length,
        passed,
        failed,
        blockerCount: blockers.length,
        warningCount: warnings.length,
      },
    };
  }

  private async checkClassificationGaps(
    periodStart: Date,
    periodEnd: Date,
    checks: CloseCheck[],
    blockers: CloseIssue[]
  ): Promise<void> {
    const unclassified = await this.prisma.blockchainEvent.findMany({
      where: {
        blockTimestamp: {
          gte: periodStart,
          lte: periodEnd,
        },
        processed: false,
      },
      take: 100,
    });

    if (unclassified.length === 0) {
      checks.push({
        name: 'Classification Complete',
        status: 'pass',
        message: 'All blockchain events classified',
      });
    } else {
      checks.push({
        name: 'Classification Complete',
        status: 'fail',
        message: `${unclassified.length} unclassified events`,
        details: { count: unclassified.length },
      });

      blockers.push({
        id: `classification-gap-${Date.now()}`,
        period: periodStart.toISOString().slice(0, 7),
        issueType: 'classification_gap',
        severity: 'blocker',
        title: 'Unclassified Blockchain Events',
        description: `${unclassified.length} blockchain events have not been classified and posted to the ledger`,
        affectedItems: unclassified.slice(0, 10).map(e => ({
          type: 'blockchain_event',
          id: e.id,
          reference: e.txHash,
        })),
        status: 'open',
      });
    }
  }

  private async checkUnreconciledItems(
    periodStart: Date,
    periodEnd: Date,
    checks: CloseCheck[],
    warnings: CloseIssue[]
  ): Promise<void> {
    // Check for entries with "pending" or "unreconciled" flags
    const unreconciled = await this.prisma.journalEntry.count({
      where: {
        date: {
          gte: periodStart,
          lte: periodEnd,
        },
        metadata: {
          path: ['reconciled'],
          equals: false,
        },
      },
    });

    if (unreconciled === 0) {
      checks.push({
        name: 'Reconciliation Complete',
        status: 'pass',
        message: 'All items reconciled',
      });
    } else {
      checks.push({
        name: 'Reconciliation Complete',
        status: 'warning',
        message: `${unreconciled} unreconciled items`,
        details: { count: unreconciled },
      });

      warnings.push({
        id: `unreconciled-${Date.now()}`,
        period: periodStart.toISOString().slice(0, 7),
        issueType: 'unreconciled',
        severity: 'warning',
        title: 'Unreconciled Entries',
        description: `${unreconciled} journal entries marked as unreconciled`,
        affectedItems: [],
        status: 'open',
      });
    }
  }

  private async checkDimensionalBalance(
    periodStart: Date,
    periodEnd: Date,
    checks: CloseCheck[],
    blockers: CloseIssue[]
  ): Promise<void> {
    // Get all postings with dimensions
    const postings = await this.prisma.posting.findMany({
      where: {
        entry: {
          date: {
            gte: periodStart,
            lte: periodEnd,
          },
        },
      },
      include: {
        dimensions: {
          include: {
            dimensionValue: {
              include: {
                dimension: true,
              },
            },
          },
        },
      },
    });

    // Group by dimension and check balance
    const dimensionBalances = new Map<string, number>();

    for (const posting of postings) {
      for (const pd of posting.dimensions) {
        const key = `${pd.dimensionValue.dimension.code}:${pd.dimensionValue.code}`;
        const balance = (dimensionBalances.get(key) || 0) + (posting.debit - posting.credit);
        dimensionBalances.set(key, balance);
      }
    }

    const imbalances: string[] = [];
    for (const [key, balance] of dimensionBalances.entries()) {
      if (Math.abs(balance) > 0.01) {
        imbalances.push(`${key}: ${balance.toFixed(2)}`);
      }
    }

    if (imbalances.length === 0) {
      checks.push({
        name: 'Dimensional Balance',
        status: 'pass',
        message: 'All dimensions balanced',
      });
    } else {
      checks.push({
        name: 'Dimensional Balance',
        status: 'fail',
        message: `${imbalances.length} dimensional imbalances`,
        details: { imbalances: imbalances.slice(0, 5) },
      });

      blockers.push({
        id: `dim-imbalance-${Date.now()}`,
        period: periodStart.toISOString().slice(0, 7),
        issueType: 'imbalance',
        severity: 'blocker',
        title: 'Dimensional Imbalances',
        description: `Dimensional balances do not net to zero`,
        affectedItems: imbalances.slice(0, 10).map(i => ({
          type: 'dimension',
          id: i,
        })),
        status: 'open',
      });
    }
  }

  private async checkEntityBalance(
    periodStart: Date,
    periodEnd: Date,
    checks: CloseCheck[],
    blockers: CloseIssue[]
  ): Promise<void> {
    const entities = await this.prisma.entity.findMany({
      where: { isActive: true },
      include: {
        accounts: {
          include: {
            postings: {
              where: {
                entry: {
                  date: {
                    gte: periodStart,
                    lte: periodEnd,
                  },
                },
              },
            },
          },
        },
      },
    });

    const imbalances: string[] = [];

    for (const entity of entities) {
      let totalDebit = 0;
      let totalCredit = 0;

      for (const account of entity.accounts) {
        for (const posting of account.postings) {
          totalDebit += posting.debit;
          totalCredit += posting.credit;
        }
      }

      const balance = totalDebit - totalCredit;
      if (Math.abs(balance) > 0.01) {
        imbalances.push(`${entity.code}: ${balance.toFixed(2)}`);
      }
    }

    if (imbalances.length === 0) {
      checks.push({
        name: 'Entity Balance',
        status: 'pass',
        message: 'All entities balanced',
      });
    } else {
      checks.push({
        name: 'Entity Balance',
        status: 'fail',
        message: `${imbalances.length} entity imbalances`,
        details: { imbalances },
      });

      blockers.push({
        id: `entity-imbalance-${Date.now()}`,
        period: periodStart.toISOString().slice(0, 7),
        issueType: 'imbalance',
        severity: 'blocker',
        title: 'Entity Imbalances',
        description: `Entity-level trial balances do not net to zero`,
        affectedItems: imbalances.map(i => ({
          type: 'entity',
          id: i,
        })),
        status: 'open',
      });
    }
  }

  private async checkSuspenseAccounts(
    periodStart: Date,
    periodEnd: Date,
    checks: CloseCheck[],
    warnings: CloseIssue[]
  ): Promise<void> {
    // Check for balances in suspense accounts (e.g., 1900, 2900)
    const suspenseAccounts = await this.prisma.account.findMany({
      where: {
        code: {
          in: ['1900', '2900'], // Common suspense account codes
        },
      },
      include: {
        postings: {
          where: {
            entry: {
              date: {
                gte: periodStart,
                lte: periodEnd,
              },
            },
          },
        },
      },
    });

    let hasSuspenseBalance = false;

    for (const account of suspenseAccounts) {
      const balance = account.postings.reduce(
        (sum, p) => sum + p.debit - p.credit,
        0
      );

      if (Math.abs(balance) > 0.01) {
        hasSuspenseBalance = true;
      }
    }

    if (!hasSuspenseBalance) {
      checks.push({
        name: 'Suspense Accounts',
        status: 'pass',
        message: 'No suspense account balances',
      });
    } else {
      checks.push({
        name: 'Suspense Accounts',
        status: 'warning',
        message: 'Suspense accounts have non-zero balances',
      });

      warnings.push({
        id: `suspense-${Date.now()}`,
        period: periodStart.toISOString().slice(0, 7),
        issueType: 'suspense_balance',
        severity: 'warning',
        title: 'Suspense Account Balances',
        description: 'Items still in suspense accounts should be cleared before close',
        affectedItems: suspenseAccounts.map(a => ({
          type: 'account',
          id: a.id,
          reference: a.code,
        })),
        status: 'open',
      });
    }
  }

  private async checkMissingFxRates(
    periodStart: Date,
    periodEnd: Date,
    checks: CloseCheck[],
    warnings: CloseIssue[]
  ): Promise<void> {
    const entities = await this.prisma.entity.findMany({
      where: { isActive: true },
      select: { currency: true },
    });

    const currencies = [...new Set(entities.map(e => e.currency))];
    const reportingCurrency = 'USD'; // Default

    const missingRates: string[] = [];

    for (const currency of currencies) {
      if (currency === reportingCurrency) continue;

      const rate = await this.prisma.exchangeRate.findFirst({
        where: {
          fromCurrency: currency,
          toCurrency: reportingCurrency,
          date: {
            gte: periodStart,
            lte: periodEnd,
          },
        },
      });

      if (!rate) {
        missingRates.push(`${currency}/${reportingCurrency}`);
      }
    }

    if (missingRates.length === 0) {
      checks.push({
        name: 'FX Rates Available',
        status: 'pass',
        message: 'All required FX rates present',
      });
    } else {
      checks.push({
        name: 'FX Rates Available',
        status: 'warning',
        message: `${missingRates.length} missing FX rates`,
        details: { missingRates },
      });

      warnings.push({
        id: `missing-fx-${Date.now()}`,
        period: periodStart.toISOString().slice(0, 7),
        issueType: 'missing_fx',
        severity: 'warning',
        title: 'Missing FX Rates',
        description: `FX rates not available for ${missingRates.join(', ')}`,
        affectedItems: missingRates.map(r => ({
          type: 'fx_rate',
          id: r,
        })),
        status: 'open',
      });
    }
  }

  private async storeChecklistResults(
    period: string,
    status: string,
    checks: CloseCheck[],
    blockers: CloseIssue[],
    warnings: CloseIssue[]
  ): Promise<void> {
    await this.prisma.closeChecklist.upsert({
      where: { period },
      update: {
        status,
        checks,
        blockers,
        warnings,
        lastChecked: new Date(),
      },
      create: {
        period,
        status,
        checks,
        blockers,
        warnings,
        lastChecked: new Date(),
      },
    });

    // Store individual issues
    for (const issue of [...blockers, ...warnings]) {
      await this.prisma.closeIssue.create({
        data: {
          period,
          issueType: issue.issueType,
          severity: issue.severity,
          title: issue.title,
          description: issue.description,
          affectedItems: issue.affectedItems,
          status: 'open',
        },
      });
    }
  }
}
