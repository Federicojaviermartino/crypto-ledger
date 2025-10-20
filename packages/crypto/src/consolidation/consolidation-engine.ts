import { PrismaClient } from '@prisma/client';
import { FxService } from './fx-service';

/**
 * Consolidation engine
 * Performs multi-entity consolidation with FX translation and eliminations
 */
export class ConsolidationEngine {
  private fxService: FxService;

  constructor(private prisma: PrismaClient) {
    this.fxService = new FxService(prisma);
  }

  /**
   * Run consolidation for a period
   */
  async runConsolidation(params: {
    period: string; // "2025-01"
    reportingCurrency: string;
    asOfDate: Date;
  }): Promise<any> {
    const { period, reportingCurrency, asOfDate } = params;

    console.log(`Running consolidation for ${period} in ${reportingCurrency}`);

    // 1. Get all active entities
    const entities = await this.prisma.entity.findMany({
      where: { isActive: true },
      include: {
        accounts: true,
      },
    });

    // 2. Get trial balance for each entity
    const entityBalances = await Promise.all(
      entities.map(entity => this.getEntityTrialBalance(entity.id, asOfDate))
    );

    // 3. Translate to reporting currency
    const translatedBalances = await Promise.all(
      entityBalances.map((balance, idx) =>
        this.translateTrialBalance(
          balance,
          entities[idx].currency,
          reportingCurrency,
          asOfDate
        )
      )
    );

    // 4. Aggregate balances
    const aggregated = this.aggregateBalances(translatedBalances);

    // 5. Apply intercompany eliminations
    const eliminated = await this.applyEliminations(aggregated, asOfDate);

    // 6. Store consolidation run
    const consolidationRun = await this.prisma.consolidationRun.create({
      data: {
        period,
        reportingCurrency,
        consolidatedData: {
          entities: entities.map(e => ({ id: e.id, code: e.code, name: e.name })),
          trialBalance: eliminated,
          eliminations: eliminated.eliminations || [],
        },
        status: 'completed',
        completedAt: new Date(),
      },
    });

    return {
      id: consolidationRun.id,
      period,
      reportingCurrency,
      trialBalance: eliminated.accounts,
      eliminations: eliminated.eliminations,
      entities: entities.length,
    };
  }

  /**
   * Get trial balance for an entity
   */
  private async getEntityTrialBalance(entityId: string, asOfDate: Date): Promise<any> {
    const accounts = await this.prisma.account.findMany({
      where: {
        entityId,
        isActive: true,
      },
    });

    const balances = await Promise.all(
      accounts.map(async account => {
        const postings = await this.prisma.posting.findMany({
          where: {
            accountId: account.id,
            entry: {
              date: { lte: asOfDate },
            },
          },
        });

        const debit = postings.reduce((sum, p) => sum + p.debit, 0);
        const credit = postings.reduce((sum, p) => sum + p.credit, 0);
        const balance = debit - credit;

        return {
          accountCode: account.code,
          accountName: account.name,
          accountType: account.type,
          debit,
          credit,
          balance,
        };
      })
    );

    return {
      entityId,
      accounts: balances.filter(b => Math.abs(b.balance) > 0.01),
    };
  }

  /**
   * Translate trial balance to reporting currency
   */
  private async translateTrialBalance(
    trialBalance: any,
    fromCurrency: string,
    toCurrency: string,
    date: Date,
  ): Promise<any> {
    if (fromCurrency === toCurrency) {
      return trialBalance;
    }

    const rate = await this.fxService.getRate(fromCurrency, toCurrency, date);

    return {
      entityId: trialBalance.entityId,
      accounts: trialBalance.accounts.map((account: any) => ({
        ...account,
        debit: account.debit * rate,
        credit: account.credit * rate,
        balance: account.balance * rate,
        originalCurrency: fromCurrency,
        translatedAt: rate,
      })),
    };
  }

  /**
   * Aggregate balances across entities
   */
  private aggregateBalances(entityBalances: any[]): any {
    const accountMap = new Map<string, any>();

    for (const entityBalance of entityBalances) {
      for (const account of entityBalance.accounts) {
        const key = account.accountCode;

        if (!accountMap.has(key)) {
          accountMap.set(key, {
            accountCode: account.accountCode,
            accountName: account.accountName,
            accountType: account.accountType,
            debit: 0,
            credit: 0,
            balance: 0,
          });
        }

        const agg = accountMap.get(key);
        agg.debit += account.debit;
        agg.credit += account.credit;
        agg.balance += account.balance;
      }
    }

    return {
      accounts: Array.from(accountMap.values()),
    };
  }

  /**
   * Apply intercompany eliminations
   */
  private async applyEliminations(aggregated: any, asOfDate: Date): Promise<any> {
    const eliminations: any[] = [];

    // Get intercompany relations
    const relations = await this.prisma.intercompanyRelation.findMany({
      where: { isActive: true },
      include: {
        fromEntity: true,
        toEntity: true,
      },
    });

    for (const relation of relations) {
      if (!relation.receivableAccountId || !relation.payableAccountId) {
        continue;
      }

      // Get balances for IC accounts
      const receivable = await this.getAccountBalance(
        relation.receivableAccountId,
        asOfDate
      );

      const payable = await this.getAccountBalance(
        relation.payableAccountId,
        asOfDate
      );

      // Eliminate matching amounts
      const eliminationAmount = Math.min(Math.abs(receivable), Math.abs(payable));

      if (eliminationAmount > 0.01) {
        eliminations.push({
          fromEntity: relation.fromEntity.code,
          toEntity: relation.toEntity.code,
          amount: eliminationAmount,
          description: `IC elimination: ${relation.fromEntity.code} <-> ${relation.toEntity.code}`,
        });

        // Adjust aggregated balances
        const recAccount = aggregated.accounts.find(
          (a: any) => a.accountCode === relation.receivableAccountId
        );

        const payAccount = aggregated.accounts.find(
          (a: any) => a.accountCode === relation.payableAccountId
        );

        if (recAccount) {
          recAccount.balance -= eliminationAmount;
        }

        if (payAccount) {
          payAccount.balance += eliminationAmount;
        }
      }
    }

    return {
      accounts: aggregated.accounts,
      eliminations,
    };
  }

  /**
   * Get account balance as of date
   */
  private async getAccountBalance(accountId: string, asOfDate: Date): Promise<number> {
    const postings = await this.prisma.posting.findMany({
      where: {
        accountId,
        entry: {
          date: { lte: asOfDate },
        },
      },
    });

    const debit = postings.reduce((sum, p) => sum + p.debit, 0);
    const credit = postings.reduce((sum, p) => sum + p.credit, 0);

    return debit - credit;
  }

  /**
   * Get consolidation by period
   */
  async getConsolidation(period: string, reportingCurrency: string): Promise<any> {
    return this.prisma.consolidationRun.findUnique({
      where: {
        period_reportingCurrency: {
          period,
          reportingCurrency,
        },
      },
    });
  }
}
