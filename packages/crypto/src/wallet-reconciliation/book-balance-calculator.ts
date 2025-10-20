import { PrismaClient } from '@prisma/client';

export class BookBalanceCalculator {
  constructor(private prisma: PrismaClient) {}

  async calculateBalance(
    glAccountId: string,
    asset: string,
    asOfDate: Date
  ): Promise<{
    balance: number;
    postingCount: number;
  }> {
    // Get all postings for this GL account up to the date
    const postings = await this.prisma.posting.findMany({
      where: {
        accountId: glAccountId,
        entry: {
          date: {
            lte: asOfDate,
          },
        },
      },
      include: {
        entry: true,
      },
    });

    // Filter by asset if metadata contains asset info
    const relevantPostings = postings.filter(p => {
      const metadata = p.entry.metadata as any;
      return !metadata?.asset || metadata.asset?.symbol === asset || metadata.asset === asset;
    });

    // Calculate balance (debit - credit)
    const balance = relevantPostings.reduce(
      (sum, p) => sum + p.debit - p.credit,
      0
    );

    return {
      balance,
      postingCount: relevantPostings.length,
    };
  }

  async calculateAllAssetBalances(
    glAccountId: string,
    asOfDate: Date
  ): Promise<Map<string, { balance: number; postingCount: number }>> {
    const postings = await this.prisma.posting.findMany({
      where: {
        accountId: glAccountId,
        entry: {
          date: {
            lte: asOfDate,
          },
        },
      },
      include: {
        entry: true,
      },
    });

    const balancesByAsset = new Map<string, { balance: number; postingCount: number }>();

    for (const posting of postings) {
      const metadata = posting.entry.metadata as any;
      const asset = metadata?.asset?.symbol || metadata?.asset || 'ETH'; // Default to ETH

      const current = balancesByAsset.get(asset) || { balance: 0, postingCount: 0 };
      current.balance += posting.debit - posting.credit;
      current.postingCount += 1;
      balancesByAsset.set(asset, current);
    }

    return balancesByAsset;
  }
}
