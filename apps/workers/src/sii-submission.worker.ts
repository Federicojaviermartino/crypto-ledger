import { Worker, Job } from 'bullmq';
import { PrismaClient } from '@prisma/client';
import { SiiService } from '@crypto-ledger/reports/sii/sii.service';
import { Logger } from '@nestjs/common';

const prisma = new PrismaClient();
const logger = new Logger('SiiSubmission');

interface SiiJobData {
  invoiceId?: string;
  submissionType?: 'issued' | 'received';
  retryFailed?: boolean;
}

/**
 * Process SII submission job
 */
async function processSiiSubmission(job: Job<SiiJobData>) {
  const config = {
    endpoint: process.env.SII_ENDPOINT || 'https://prewww1.aeat.es/wlpl/SSII-FACT/ws/fe/SiiFactFEV1SOAP',
    environment: (process.env.SII_ENVIRONMENT as any) || 'sandbox',
    nif: process.env.COMPANY_NIF || 'B12345678',
  };

  const siiService = new SiiService(prisma, config);

  if (job.data.retryFailed) {
    // Retry failed submissions
    logger.log('Retrying failed SII submissions');
    const retriedCount = await siiService.retryFailedSubmissions();
    logger.log(`Retried ${retriedCount} submissions`);

    return {
      type: 'retry',
      retriedCount,
    };
  }

  if (job.data.invoiceId) {
    // Submit specific invoice
    const { invoiceId, submissionType = 'issued' } = job.data;
    
    logger.log(`Submitting invoice ${invoiceId} to SII`);
    
    await siiService.submitInvoice(invoiceId, submissionType);
    
    const status = await siiService.getSubmissionStatus(invoiceId);
    
    logger.log(`Invoice ${invoiceId} submission complete: ${status.isAccepted ? 'accepted' : 'rejected'}`);
    
    return {
      type: 'single',
      invoiceId,
      ...status,
    };
  }

  // Check for overdue submissions
  const overdue = await siiService.checkSubmissionDeadlines();
  
  if (overdue.length > 0) {
    logger.warn(`${overdue.length} invoices are overdue for SII submission`);
    overdue.forEach(inv => {
      logger.warn(`  Invoice ${inv.invoiceId}: ${inv.daysOverdue} days overdue`);
    });
  }

  return {
    type: 'check_deadlines',
    overdueCount: overdue.length,
    overdue,
  };
}

const worker = new Worker('sii-submission', processSiiSubmission, {
  connection: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
  },
  limiter: {
    max: 10, // Respect AEAT rate limits
    duration: 60000,
  },
});

worker.on('completed', (job) => {
  logger.log(`Job ${job.id} completed`);
});

worker.on('failed', (job, err) => {
  logger.error(`Job ${job?.id} failed: ${err.message}`);
});

logger.log('SII submission worker started');
