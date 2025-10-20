import * as duckdb from 'duckdb';
import * as path from 'path';
import * as fs from 'fs';

/**
 * DuckDB Manager
 * Handles DuckDB connections and operations
 */
export class DuckDBManager {
  private db: duckdb.Database | null = null;
  private snapshotsDir: string;

  constructor(snapshotsDir?: string) {
    this.snapshotsDir = snapshotsDir || path.join(process.cwd(), 'data', 'snapshots');
    
    if (!fs.existsSync(this.snapshotsDir)) {
      fs.mkdirSync(this.snapshotsDir, { recursive: true });
    }
  }

  async connect(dbPath: string): Promise<duckdb.Database> {
    return new Promise((resolve, reject) => {
      const db = new duckdb.Database(dbPath, (err) => {
        if (err) reject(err);
        else {
          this.db = db;
          resolve(db);
        }
      });
    });
  }

  async execute<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    if (!this.db) throw new Error('Database not connected');

    return new Promise((resolve, reject) => {
      this.db!.all(sql, ...params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows as T[]);
      });
    });
  }

  async createSnapshot(asOfDate: Date): Promise<string> {
    const filename = `snapshot_${asOfDate.toISOString().split('T')[0]}.duckdb`;
    const dbPath = path.join(this.snapshotsDir, filename);

    await this.connect(dbPath);

    await this.execute(`
      CREATE TABLE trial_balance (
        account_code VARCHAR,
        account_name VARCHAR,
        account_type VARCHAR,
        debit DECIMAL(18,2),
        credit DECIMAL(18,2),
        balance DECIMAL(18,2),
        legal_entity VARCHAR,
        cost_center VARCHAR,
        project VARCHAR,
        product VARCHAR,
        wallet VARCHAR,
        as_of_date DATE
      )
    `);

    return dbPath;
  }

  async insertBatch(tableName: string, rows: any[]): Promise<void> {
    if (rows.length === 0) return;

    const columns = Object.keys(rows[0]);
    const placeholders = columns.map(() => '?').join(', ');
    const sql = `INSERT INTO ${tableName} VALUES (${placeholders})`;

    for (const row of rows) {
      const values = columns.map(col => row[col]);
      await this.execute(sql, values);
    }
  }

  async optimizeDatabase(): Promise<void> {
    await this.execute('ANALYZE');
  }

  getSnapshotPath(asOfDate: Date): string {
    const filename = `snapshot_${asOfDate.toISOString().split('T')[0]}.duckdb`;
    return path.join(this.snapshotsDir, filename);
  }

  async close(): Promise<void> {
    if (this.db) {
      return new Promise((resolve, reject) => {
        this.db!.close((err) => {
          if (err) reject(err);
          else {
            this.db = null;
            resolve();
          }
        });
      });
    }
  }
}
