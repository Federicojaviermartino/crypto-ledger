import { PrismaClient } from '@prisma/client';

/**
 * Reconciliation Matcher
 * Intelligent matching of bank transactions to journal entries
 */
export class ReconciliationMatcher {
  constructor(private prisma: PrismaClient) {}

  /**
   * Find potential matches for a bank transaction
   */
  async findMatches(transaction: {
    date: Date;
    amount: number;
    description: string;
    reference?: string;
  }): Promise<Array<{
    entryId: string;
    entry: any;
    score: number;
    reasons: string[];
  }>> {
    // Search window: ±7 days from transaction date
    const startDate = new Date(transaction.date);
    startDate.setDate(startDate.getDate() - 7);
    
    const endDate = new Date(transaction.date);
    endDate.setDate(endDate.getDate() + 7);

    // Find entries with matching amount
    const entries = await this.prisma.journalEntry.findMany({
      where: {
        date: {
          gte: startDate,
          lte: endDate,
        },
      },
      include: {
        postings: {
          include: {
            account: true,
          },
        },
      },
    });

    const matches = [];

    for (const entry of entries) {
      const score = this.calculateMatchScore(transaction, entry);
      
      if (score > 0.5) {
        matches.push({
          entryId: entry.id,
          entry,
          score,
          reasons: this.getMatchReasons(transaction, entry, score),
        });
      }
    }

    // Sort by score descending
    return matches.sort((a, b) => b.score - a.score);
  }

  /**
   * Calculate match score (0-1)
   */
  private calculateMatchScore(transaction: any, entry: any): number {
    let score = 0;
    const weights = {
      amount: 0.4,
      date: 0.3,
      description: 0.2,
      reference: 0.1,
    };

    // Amount match (must be exact)
    const entryTotal = entry.postings.reduce(
      (sum: number, p: any) => sum + (p.debit || -p.credit),
      0
    );

    if (Math.abs(entryTotal - Math.abs(transaction.amount)) < 0.01) {
      score += weights.amount;
    } else {
      return 0; // Amount mismatch is disqualifying
    }

    // Date proximity (within 7 days gets partial points)
    const daysDiff = Math.abs(
      (new Date(entry.date).getTime() - transaction.date.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (daysDiff === 0) {
      score += weights.date;
    } else if (daysDiff <= 3) {
      score += weights.date * 0.7;
    } else if (daysDiff <= 7) {
      score += weights.date * 0.4;
    }

    // Description similarity
    const descScore = this.textSimilarity(
      transaction.description.toLowerCase(),
      entry.description.toLowerCase()
    );
    score += weights.description * descScore;

    // Reference match
    if (transaction.reference && entry.reference) {
      if (transaction.reference === entry.reference) {
        score += weights.reference;
      }
    }

    return Math.min(score, 1);
  }

  /**
   * Calculate text similarity (simple word overlap)
   */
  private textSimilarity(text1: string, text2: string): number {
    const words1 = new Set(text1.split(/\s+/).filter(w => w.length > 3));
    const words2 = new Set(text2.split(/\s+/).filter(w => w.length > 3));

    if (words1.size === 0 || words2.size === 0) return 0;

    let overlap = 0;
    for (const word of words1) {
      if (words2.has(word)) overlap++;
    }

    return overlap / Math.max(words1.size, words2.size);
  }

  /**
   * Get reasons for match
   */
  private getMatchReasons(transaction: any, entry: any, score: number): string[] {
    const reasons = [];

    if (score >= 0.9) {
      reasons.push('Exact amount and date match');
    } else if (score >= 0.7) {
      reasons.push('Amount match with close date');
    } else {
      reasons.push('Amount match');
    }

    const daysDiff = Math.abs(
      (new Date(entry.date).getTime() - transaction.date.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (daysDiff === 0) {
      reasons.push('Same date');
    } else {
      reasons.push(`${Math.floor(daysDiff)} days apart`);
    }

    return reasons;
  }

  /**
   * Auto-reconcile high-confidence matches
   */
  async autoReconcile(bankAccountId: string, minScore: number = 0.95): Promise<number> {
    const unmatched = await this.prisma.bankTransaction.findMany({
      where: {
        matched: false,
        statement: {
          bankAccountId,
        },
      },
    });

    let reconciledCount = 0;

    for (const transaction of unmatched) {
      const matches = await this.findMatches({
        date: transaction.transactionDate,
        amount: transaction.amount,
        description: transaction.description,
        reference: transaction.reference || undefined,
      });

      // Auto-match if high confidence
      if (matches.length > 0 && matches[0].score >= minScore) {
        await this.prisma.bankTransaction.update({
          where: { id: transaction.id },
          data: {
            matched: true,
            matchedEntryId: matches[0].entryId,
            matchScore: matches[0].score,
          },
        });

        await this.prisma.bankReconciliation.create({
          data: {
            bankAccountId,
            bankTransactionId: transaction.id,
            matchType: 'automatic',
            confidence: matches[0].score,
          },
        });

        reconciledCount++;
      }
    }

    return reconciledCount++;
  }
}
