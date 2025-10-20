import { DuckDBManager } from './duckdb-manager';
import { AnalyticsQuery, AnalyticsResult } from '@crypto-ledger/shared/types/analytics.types';

export class QueryEngine {
  constructor(private duckdb: DuckDBManager) {}

  async executeQuery(query: AnalyticsQuery): Promise<AnalyticsResult> {
    const startTime = Date.now();

    // Connect to snapshot
    const dbPath = this.duckdb.getSnapshotPath(query.asOfDate);
    await this.duckdb.connect(dbPath);

    // Build SQL
    const sql = this.buildSQL(query);

    // Execute
    const rows = await this.duckdb.execute(sql);

    // Close
    await this.duckdb.close();

    const executionTimeMs = Date.now() - startTime;

    return {
      rows,
      executionTimeMs,
      rowCount: rows.length,
      fromCache: true,
    };
  }

  private buildSQL(query: AnalyticsQuery): string {
    let sql = 'SELECT ';

    // Select columns
    if (query.groupBy && query.groupBy.length > 0) {
      const groupCols = query.groupBy.map(col => this.mapColumn(col));
      sql += groupCols.join(', ') + ', ';
      sql += 'SUM(debit) as total_debit, ';
      sql += 'SUM(credit) as total_credit, ';
      sql += 'SUM(balance) as total_balance';
    } else {
      sql += '*';
    }

    sql += ' FROM trial_balance';

    // WHERE clause
    const whereClauses: string[] = [];

    if (query.filters) {
      for (const [key, value] of Object.entries(query.filters)) {
        if (value !== null && value !== undefined) {
          const column = this.mapColumn(key);
          
          if (Array.isArray(value)) {
            const values = value.map(v => `'${v}'`).join(', ');
            whereClauses.push(`${column} IN (${values})`);
          } else {
            whereClauses.push(`${column} = '${value}'`);
          }
        }
      }
    }

    if (whereClauses.length > 0) {
      sql += ' WHERE ' + whereClauses.join(' AND ');
    }

    // GROUP BY clause
    if (query.groupBy && query.groupBy.length > 0) {
      const groupCols = query.groupBy.map(col => this.mapColumn(col));
      sql += ' GROUP BY ' + groupCols.join(', ');
    }

    // ORDER BY clause
    if (query.orderBy) {
      sql += ' ORDER BY ' + this.mapColumn(query.orderBy);
    }

    // LIMIT clause
    if (query.limit) {
      sql += ' LIMIT ' + query.limit;
    }

    return sql;
  }

  private mapColumn(column: string): string {
    const mapping: Record<string, string> = {
      accountCode: 'account_code',
      accountName: 'account_name',
      accountType: 'account_type',
      legalEntity: 'legal_entity',
      costCenter: 'cost_center',
      project: 'project',
      product: 'product',
      wallet: 'wallet',
      geography: 'geography',
      customKv: 'custom_kv',
    };

    return mapping[column] || column;
  }

  async getTrialBalance(
    asOfDate: Date,
    groupBy?: string[],
    filters?: Record<string, any>
  ): Promise<AnalyticsResult> {
    return this.executeQuery({
      asOfDate,
      groupBy,
      filters,
      orderBy: 'account_code',
    });
  }

  async getDimensionalBreakdown(
    asOfDate: Date,
    dimension: string,
    filters?: Record<string, any>
  ): Promise<AnalyticsResult> {
    return this.executeQuery({
      asOfDate,
      groupBy: [dimension],
      filters,
      orderBy: 'total_balance DESC',
    });
  }
}
