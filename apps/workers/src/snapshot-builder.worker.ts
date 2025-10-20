import { Worker, Job } from 'bullmq';
import { PrismaClient } from '@prisma/client';
import { DuckDBManager } from '@crypto-ledger/analytics/duckdb/duckdb-manager';
import { SnapshotBuilder } from '@crypto-ledger/analytics/duckdb/snapshot-builder';
import { Logger } from '@nestjs/common';

const prisma = new PrismaClient();
const logger = new Logger('SnapshotBuilder');

interface SnapshotJobData {
  asOfDate?: string;
}

async function buildSnapshot(job: Job<SnapshotJobData>) {
  const asOfDate = job.data.asOfDate 
    ? new Date(job.data.asOfDate)
    : new Date();

  logger.log(`Building columnar snapshot for ${asOfDate.toISOString().split('T')[0]}`);

  const duckdb = new DuckDBManager();
  const builder = new SnapshotBuilder(prisma, duckdb);

  try {
    const result = await builder.buildSnapshot(asOfDate);

    // Store metadata in PostgreSQL
    await prisma.columnarSnapshot.create({
      data: {
        asOfDate,
        recordCount: result.recordCount,
        duckdbPath: result.dbPath,
        fileSize: BigInt(result.fileSize),
      },
    });

    logger.log(`Snapshot created successfully`);
    logger.log(`Path: ${result.dbPath}`);
    logger.log(`Records: ${result.recordCount}`);
    logger.log(`Size: ${(result.fileSize / 1024 / 1024).toFixed(2)} MB`);

    return {
      asOfDate: asOfDate.toISOString().split('T')[0],
      recordCount: result.recordCount,
      fileSize: result.fileSize,
      dbPath: result.dbPath,
    };
  } catch (error) {
    logger.error(`Snapshot build failed:`, error);
    throw error;
  }
}

const worker = new Worker('snapshot-builder', buildSnapshot, {
  connection: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
  },
});

worker.on('completed', (job) => {
  logger.log(`Job ${job.id} completed:`, job.returnvalue);
});

worker.on('failed', (job, err) => {
  logger.error(`Job ${job?.id} failed: ${err.message}`);
});

logger.log('Snapshot builder worker started');
