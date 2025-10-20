import { PrismaClient } from '@prisma/client';
import { DuckDBManager } from './duckdb-manager';

/**
 * DuckDB Snapshot Builder
 * Creates columnar snapshots for fast analytics
 */
export class SnapshotBuilder {
  constructor(
    private prisma: PrismaClient,
    private duckdb: DuckDBManager
  ) {}

  /**
   * Build snapshot for specific date
   */
  async buildSnapshot(asOfDate: Date): Promise<{
    dbPath: string;
    recordCount: number;
    fileSize: number;
  }> {
    const startTime = Date.now();

    // Create DuckDB database
    const dbPath = await this.duckdb.createSnapshot(asOfDate);

    // Fetch trial balance data
    const trialBalanceData = await this.fetchTrialBalanceData(asOfDate);

    // Transform to columnar format
    const rows = this.transformToColumnarFormat(trialBalanceData, asOfDate);

    // Insert into DuckDB
    await this.duckdb.insertBatch('trial_balance', rows);

    // Optimize
    await this.duckdb.optimizeDatabase();

    // Close connection
    await this.duckdb.close();

    // Get file size
    const fs = require('fs');
    const stats = fs.statSync(dbPath);

    const executionTime = Date.now() - startTime;

    console.log(`✅ Snapshot built in ${executionTime}ms`);
    console.log(`   Records: ${rows.length}`);
    console.log(`   Size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);

    return {
      dbPath,
      recordCount: rows.length,
      fileSize: stats.size,
    };
  }

  /**
   * Fetch trial balance data from PostgreSQL
   */
  private async fetchTrialBalanceData(asOfDate: Date) {
    const postings = await this.prisma.posting.findMany({
      where: {
        entry: {
          date: { lte: asOfDate },
        },
      },
      include: {
        account: true,
        entry: true,
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

    // Group by account + dimensions
    const groupedData = new Map<string, any>();

    for (const posting of postings) {
      const dimensions: Record<string, string> = {};
      
      for (const pd of posting.dimensions) {
        const dimCode = pd.dimensionValue.dimension.code;
        dimensions[dimCode] = pd.dimensionValue.code;
      }

      const key = this.createGroupKey(posting.account.code, dimensions);

      if (!groupedData.has(key)) {
        groupedData.set(key, {
          accountCode: posting.account.code,
          accountName: posting.account.name,
          accountType: posting.account.type,
          debit: 0,
          credit: 0,
          dimensions,
        });
      }

      const group = groupedData.get(key);
      group.debit += posting.debit;
      group.credit += posting.credit;
    }

    return Array.from(groupedData.values());
  }

  /**
   * Create grouping key
   */
  private createGroupKey(accountCode: string, dimensions: Record<string, string>): string {
    const parts = [accountCode];
    const dimOrder = ['legal_entity', 'cost_center', 'project', 'product', 'wallet'];
    
    for (const dim of dimOrder) {
      parts.push(dimensions[dim] || 'NULL');
    }

    return parts.join('|');
  }

  /**
   * Transform to columnar format
   */
  private transformToColumnarFormat(data: any[], asOfDate: Date): any[] {
    return data.map(item => ({
      account_code: item.accountCode,
      account_name: item.accountName,
      account_type: item.accountType,
      debit: item.debit,
      credit: item.credit,
      balance: item.debit - item.credit,
      legal_entity: item.dimensions.legal_entity || null,
      cost_center: item.dimensions.cost_center || null,
      project: item.dimensions.project || null,
      product: item.dimensions.product || null,
      wallet: item.dimensions.wallet || null,
      as_of_date: asOfDate.toISOString().split('T')[0],
    }));
  }
}
