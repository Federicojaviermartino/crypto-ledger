import { Worker, Job } from 'bullmq';
import { PrismaClient } from '@prisma/client';
import { PriceService } from '@crypto-ledger/crypto/pricing/price.service';
import { Logger } from '@nestjs/common';

const prisma = new PrismaClient();
const logger = new Logger('PriceBackfill');

interface BackfillJobData {
  asset: string;
  quote: string;
  days?: number;
}

async function backfillPrices(job: Job<BackfillJobData>) {
  const { asset, quote, days = 90 } = job.data;

  logger.log(`Starting price backfill for ${asset}/${quote} - ${days} days`);

  const priceService = new PriceService(prisma, {
    source: process.env.PRICE_SOURCE || 'coingecko',
    coingeckoApiKey: process.env.COINGECKO_API_KEY,
  });

  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - days);

  const stored = await priceService.backfillPrices({
    asset,
    quote,
    from,
    to,
    interval: 'daily',
  });

  logger.log(`Backfilled ${stored} price points for ${asset}/${quote}`);

  return {
    asset,
    quote,
    days,
    pricesStored: stored,
    from: from.toISOString(),
    to: to.toISOString(),
  };
}

const worker = new Worker('price-backfill', backfillPrices, {
  connection: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
  },
  limiter: {
    max: 5, // Respect API rate limits
    duration: 60000,
  },
});

worker.on('completed', (job) => {
  logger.log(`Job ${job.id} completed:`, job.returnvalue);
});

worker.on('failed', (job, err) => {
  logger.error(`Job ${job?.id} failed: ${err.message}`);
});

logger.log('Price backfill worker started');
