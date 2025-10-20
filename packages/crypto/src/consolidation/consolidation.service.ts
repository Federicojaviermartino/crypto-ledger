import { PrismaClient } from '@prisma/client';
import { FxService } from './fx.service';
import { ConsolidatedBalance } from '@crypto-ledger/shared/types/entity.types';

export class ConsolidationService {
  private fxService: FxService;

  constructor(private prisma: PrismaClient) {
    this.fxService = new FxService(prisma);
  }

  async runConsolidation(period: string, reportingCurrency: string) {
    const [year, month] = period.split('-').map(Number);
    const periodStart = new Date(year, month - 1, 1);
    const periodEnd = new Date(year, month, 0, 23, 59, 59, 999);

    // Create consolidation run
    const run = await this.prisma.consolidationRun.create({
      data: {
        period,
        periodStart,
        periodEnd,
        status: 'running',
        reportingCurrency,
        fxRateSource: 'ecb',
      },
    });

    try {
      // Get all entities
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

      // Calculate balances per entity
      const consolidatedBalances: ConsolidatedBalance[] = [];
      const accountMap = new Map<string, ConsolidatedBalance>();

      for (const entity of entities) {
        for (const account of entity.accounts) {
          const debit = account.postings.reduce((sum, p) => sum + p.debit, 0);
          const credit = account.postings.reduce((sum, p) => sum + p.credit, 0);
          const localBalance = debit - credit;

          if (Math.abs(localBalance) < 0.01) continue;

          // Translate to reporting currency
          const translation = await this.fxService.translate(
            localBalance,
            entity.currency,
            reportingCurrency,
            periodEnd
          );

          const key = account.code;
          if (!accountMap.has(key)) {
            accountMap.set(key, {
              accountCode: account.code,
              accountName: account.name,
              entityBalances: [],
              consolidatedAmount: 0,
              eliminations: 0,
              finalAmount: 0,
            });
          }

          const consolidated = accountMap.get(key)!;
          consolidated.entityBalances.push({
            entityCode: entity.code,
            entityName: entity.name,
            currency: entity.currency,
            localAmount: localBalance,
            translatedAmount: translation.translatedAmount,
            fxRate: translation.rate,
          });

          consolidated.consolidatedAmount += translation.translatedAmount;
        }
      }

      // Calculate intercompany eliminations
      const eliminations = await this.calculateEliminations(entities, periodStart, periodEnd, reportingCurrency);

      // Apply eliminations
      for (const [accountCode, eliminationAmount] of eliminations.entries()) {
        const consolidated = accountMap.get(accountCode);
        if (consolidated) {
          consolidated.eliminations = eliminationAmount;
          consolidated.finalAmount = consolidated.consolidatedAmount - eliminationAmount;
        }
      }

      const balances = Array.from(accountMap.values());

      // Verify consolidated TB = 0
      const totalDebit = balances.filter(b => b.finalAmount > 0).reduce((sum, b) => sum + b.finalAmount, 0);
      const totalCredit = balances.filter(b => b.finalAmount < 0).reduce((sum, b) => sum + Math.abs(b.finalAmount), 0);
      const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01;

      // Update consolidation run
      await this.prisma.consolidationRun.update({
        where: { id: run.id },
        data: {
          status: 'completed',
          consolidatedData: {
            balances,
            totalDebit,
            totalCredit,
            isBalanced,
            entities: entities.map(e => ({
              code: e.code,
              name: e.name,
              currency: e.currency,
            })),
          },
          completedAt: new Date(),
        },
      });

      return {
        runId: run.id,
        period,
        reportingCurrency,
        balances,
        summary: {
          entities: entities.length,
          accounts: balances.length,
          totalDebit,
          totalCredit,
          isBalanced,
        },
      };
    } catch (error) {
      await this.prisma.consolidationRun.update({
        where: { id: run.id },
        data: { status: 'failed' },
      });
      throw error;
    }
  }

  private async calculateEliminations(
    entities: any[],
    periodStart: Date,
    periodEnd: Date,
    reportingCurrency: string
  ): Promise<Map<string, number>> {
    const eliminations = new Map<string, number>();

    // Get intercompany relations
    const relations = await this.prisma.intercompanyRelation.findMany({
      include: {
        fromEntity: true,
        toEntity: true,
      },
    });

    for (const relation of relations) {
      if (!relation.arAccountCode || !relation.apAccountCode) continue;

      // Get AR balance from entity
      const arPostings = await this.prisma.posting.findMany({
        where: {
          account: {
            code: relation.arAccountCode,
            entityId: relation.fromEntityId,
          },
          entry: {
            date: {
              gte: periodStart,
              lte: periodEnd,
            },
          },
        },
      });

      const arBalance = arPostings.reduce((sum, p) => sum + p.debit - p.credit, 0);

      // Get AP balance to entity
      const apPostings = await this.prisma.posting.findMany({
        where: {
          account: {
            code: relation.apAccountCode,
            entityId: relation.toEntityId,
          },
          entry: {
            date: {
              gte: periodStart,
              lte: periodEnd,
            },
          },
        },
      });

      const apBalance = apPostings.reduce((sum, p) => sum + p.debit - p.credit, 0);

      // Translate both to reporting currency
      const arTranslated = await this.fxService.translate(
        arBalance,
        relation.fromEntity.currency,
        reportingCurrency,
        periodEnd
      );

      const apTranslated = await this.fxService.translate(
        apBalance,
        relation.toEntity.currency,
        reportingCurrency,
        periodEnd
      );

      // Elimination = min(abs(AR), abs(AP))
      const eliminationAmount = Math.min(
        Math.abs(arTranslated.translatedAmount),
        Math.abs(apTranslated.translatedAmount)
      );

      eliminations.set(
        relation.arAccountCode,
        (eliminations.get(relation.arAccountCode) || 0) + eliminationAmount
      );
      eliminations.set(
        relation.apAccountCode,
        (eliminations.get(relation.apAccountCode) || 0) + eliminationAmount
      );
    }

    return eliminations;
  }

  async getConsolidationRun(period: string) {
    return this.prisma.consolidationRun.findUnique({
      where: { period },
    });
  }
}
