import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CsvStatementParser } from '@crypto-ledger/reports/parsers/csv-parser';
import { Camt053Parser } from '@crypto-ledger/reports/parsers/camt053-parser';
import { ReconciliationMatcher } from '@crypto-ledger/crypto/reconciliation/matcher.service';

/**
 * Service for bank reconciliation
 */
@Injectable()
export class ReconciliationService {
  private csvParser: CsvStatementParser;
  private camtParser: Camt053Parser;
  private matcher: ReconciliationMatcher;

  constructor(private prisma: PrismaService) {
    this.csvParser = new CsvStatementParser();
    this.camtParser = new Camt053Parser();
    this.matcher = new ReconciliationMatcher(this.prisma);
  }

  /**
   * Import bank statement from CSV
   */
  async importCsvStatement(
    bankAccountId: string,
    csvContent: string,
    statementDate: Date,
    format: 'generic' | 'caixabank' | 'santander' = 'generic'
  ) {
    const bankAccount = await this.prisma.bankAccount.findUnique({
      where: { id: bankAccountId },
    });

    if (!bankAccount) {
      throw new NotFoundException(`Bank account ${bankAccountId} not found`);
    }

    const parsed = await this.csvParser.parseStatement(csvContent, format);

    return this.prisma.executeTransaction(async (tx) => {
      const statement = await tx.bankStatement.create({
        data: {
          bankAccountId,
          statementDate,
          openingBalance: parsed.openingBalance,
          closingBalance: parsed.closingBalance,
          filename: `import_${Date.now()}.csv`,
        },
      });

      await tx.bankTransaction.createMany({
        data: parsed.transactions.map(t => ({
          statementId: statement.id,
          transactionDate: t.date,
          valueDate: t.valueDate,
          amount: t.amount,
          description: t.description,
          reference: t.reference,
        })),
      });

      const transactionCount = parsed.transactions.length;

      return {
        statementId: statement.id,
        transactionCount,
        openingBalance: parsed.openingBalance,
        closingBalance: parsed.closingBalance,
      };
    });
  }

  /**
   * Import bank statement from camt.053 XML
   */
  async importCamt053Statement(
    bankAccountId: string,
    xmlContent: string,
    statementDate: Date
  ) {
    const parsed = await this.camtParser.parseStatement(xmlContent);

    return this.prisma.executeTransaction(async (tx) => {
      const statement = await tx.bankStatement.create({
        data: {
          bankAccountId,
          statementDate,
          openingBalance: parsed.openingBalance,
          closingBalance: parsed.closingBalance,
          filename: `camt053_${Date.now()}.xml`,
        },
      });

      await tx.bankTransaction.createMany({
        data: parsed.transactions.map(t => ({
          statementId: statement.id,
          transactionDate: t.date,
          valueDate: t.valueDate,
          amount: t.amount,
          description: t.description,
          reference: t.reference,
        })),
      });

      return {
        statementId: statement.id,
        transactionCount: parsed.transactions.length,
      };
    });
  }

  /**
   * Find matches for unmatched transactions
   */
  async findMatches(transactionId: string) {
    const transaction = await this.prisma.bankTransaction.findUnique({
      where: { id: transactionId },
    });

    if (!transaction) {
      throw new NotFoundException(`Transaction ${transactionId} not found`);
    }

    return this.matcher.findMatches({
      date: transaction.transactionDate,
      amount: transaction.amount,
      description: transaction.description,
      reference: transaction.reference || undefined,
    });
  }

  /**
   * Manually match transaction to entry
   */
  async manualMatch(transactionId: string, entryId: string, userId?: string) {
    const transaction = await this.prisma.bankTransaction.findUnique({
      where: { id: transactionId },
      include: { statement: true },
    });

    if (!transaction) {
      throw new NotFoundException(`Transaction ${transactionId} not found`);
    }

    await this.prisma.bankTransaction.update({
      where: { id: transactionId },
      data: {
        matched: true,
        matchedEntryId: entryId,
        matchScore: 1.0,
      },
    });

    return this.prisma.bankReconciliation.create({
      data: {
        bankAccountId: transaction.statement.bankAccountId,
        bankTransactionId: transactionId,
        matchType: 'manual',
        confidence: 1.0,
        reconciledBy: userId,
      },
    });
  }

  /**
   * Auto-reconcile all unmatched transactions
   */
  async autoReconcile(bankAccountId: string, minScore: number = 0.95) {
    const count = await this.matcher.autoReconcile(bankAccountId, minScore);
    return { reconciled: count };
  }

  /**
   * Get unmatched transactions
   */
  async getUnmatched(bankAccountId: string) {
    return this.prisma.bankTransaction.findMany({
      where: {
        matched: false,
        statement: {
          bankAccountId,
        },
      },
      include: {
        statement: true,
      },
      orderBy: { transactionDate: 'desc' },
    });
  }
}
