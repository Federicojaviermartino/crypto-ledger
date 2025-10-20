import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DimensionalBalance, DimensionGrouping } from '@crypto-ledger/shared/types/dimension.types';

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

  async trialBalance(params?: {
    asOf?: Date;
    groupBy?: string[]; // dimension codes
    filterBy?: Record<string, string>; // dimension filters
  }): Promise<DimensionalBalance[]> {
    const { asOf, groupBy = [], filterBy = {} } = params || {};

    // Build WHERE clause for filters
    const postingWhere: any = {
      entry: asOf ? { date: { lte: asOf } } : undefined,
    };

    // Apply dimension filters
    if (Object.keys(filterBy).length > 0) {
      postingWhere.dimensions = {
        some: {
          dimensionValue: {
            OR: Object.entries(filterBy).map(([dimCode, valueCode]) => ({
              dimension: { code: dimCode },
              code: valueCode,
            })),
          },
        },
      };
    }

    // Fetch all relevant postings
    const postings = await this.prisma.posting.findMany({
      where: postingWhere,
      include: {
        account: true,
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

    // Group by account + requested dimensions
    const groups = new Map<string, DimensionalBalance>();

    for (const posting of postings) {
      const dimMap: Record<string, string> = {};
      
      for (const pd of posting.dimensions) {
        dimMap[pd.dimensionValue.dimension.code] = pd.dimensionValue.code;
      }

      // Build grouping key
      const keyParts = [posting.account.code];
      
      for (const dimCode of groupBy) {
        keyParts.push(dimMap[dimCode] || '__NONE__');
      }
      
      const key = keyParts.join('|');

      if (!groups.has(key)) {
        const groupDims: Record<string, string> = {};
        groupBy.forEach((dc, idx) => {
          groupDims[dc] = keyParts[idx + 1];
        });

        groups.set(key, {
          dimensions: groupDims,
          accountCode: posting.account.code,
          accountName: posting.account.name,
          debit: 0,
          credit: 0,
          balance: 0,
        });
      }

      const group = groups.get(key)!;
      group.debit += posting.debit;
      group.credit += posting.credit;
      group.balance = group.debit - group.credit;
    }

    return Array.from(groups.values());
  }

  async verifyGlobalBalance(balances: DimensionalBalance[]): Promise<boolean> {
    const totalDebit = balances.reduce((sum, b) => sum + b.debit, 0);
    const totalCredit = balances.reduce((sum, b) => sum + b.credit, 0);
    
    return Math.abs(totalDebit - totalCredit) < 0.01;
  }
}
