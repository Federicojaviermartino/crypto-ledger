import { Worker, Job } from 'bullmq';
import { PrismaClient } from '@prisma/client';
import { ClassificationEngine } from '@crypto-ledger/crypto/classification/classification-engine';
import { Logger } from '@nestjs/common';

const prisma = new PrismaClient();
const logger = new Logger('Classification');

interface ClassificationJobData {
  eventId?: string;
  batchSize?: number;
}

/**
 * Process classification job
 */
async function processClassification(job: Job<ClassificationJobData>): Promise<any> {
  const engine = new ClassificationEngine(prisma);

  if (job.data.eventId) {
    // Classify specific event
    logger.log(`Classifying event ${job.data.eventId}`);
    const classification = await engine.classifyEvent(job.data.eventId);

    return {
      eventId: job.data.eventId,
      classification,
    };
  } else {
    // Classify batch of unprocessed events
    logger.log('Classifying unprocessed events');
    const classified = await engine.classifyUnprocessed();

    logger.log(`Classified ${classified} events`);

    return {
      classified,
    };
  }
}

const worker = new Worker('classification', processClassification, {
  connection: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
  },
  concurrency: parseInt(process.env.WORKER_CONCURRENCY || '5', 10),
});

worker.on('completed', (job) => {
  logger.log(`Job ${job.id} completed`);
});

worker.on('failed', (job, err) => {
  logger.error(`Job ${job?.id} failed: ${err.message}`);
});

logger.log('Classification worker started');
