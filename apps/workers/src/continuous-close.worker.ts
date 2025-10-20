import { Worker, Job } from 'bullmq';
import { PrismaClient } from '@prisma/client';
import { CloseValidatorService } from '@crypto-ledger/crypto/close/close-validator.service';
import { Logger } from '@nestjs/common';

const prisma = new PrismaClient();
const logger = new Logger('ContinuousClose');

interface CloseValidationJobData {
  period?: string; // YYYY-MM, defaults to current month
}

async function validateCloseReadiness(job: Job<CloseValidationJobData>) {
  const period = job.data.period || new Date().toISOString().slice(0, 7);

  logger.log(`Running close validation for period ${period}`);

  const validator = new CloseValidatorService(prisma);
  const health = await validator.validatePeriod(period);

  logger.log(`Close validation complete: ${health.status}`);
  logger.log(`Blockers: ${health.blockers.length}, Warnings: ${health.warnings.length}`);

  if (health.blockers.length > 0) {
    logger.warn('Period has blocking issues:');
    health.blockers.forEach(b => {
      logger.warn(`  - ${b.title}: ${b.description}`);
    });
  }

  return {
    period,
    status: health.status,
    readyToClose: health.readyToClose,
    summary: health.summary,
  };
}

const worker = new Worker('continuous-close', validateCloseReadiness, {
  connection: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
  },
  limiter: {
    max: 1,
    duration: 3600000, // Once per hour max
  },
});

worker.on('completed', (job) => {
  logger.log(`Job ${job.id} completed:`, job.returnvalue);
});

worker.on('failed', (job, err) => {
  logger.error(`Job ${job?.id} failed: ${err.message}`);
});

logger.log('Continuous close worker started');
