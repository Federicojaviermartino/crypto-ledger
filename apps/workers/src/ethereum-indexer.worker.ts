import { Worker, Job } from 'bullmq';
import { PrismaClient } from '@prisma/client';
import { EthereumIndexer } from '@crypto-ledger/crypto/indexer/ethereum-indexer';
import { Logger } from '@nestjs/common';

const prisma = new PrismaClient();
const logger = new Logger('EthereumIndexer');

interface IndexerJobData {
  startBlock?: number;
  endBlock?: number;
}

/**
 * Process indexing job
 */
async function processIndexing(job: Job<IndexerJobData>): Promise<any> {
  const rpcUrl = process.env.ETH_RPC_URL || 'https://ethereum.publicnode.com';
  const network = process.env.ETH_NETWORK || 'mainnet';

  const indexer = new EthereumIndexer(rpcUrl, network, prisma);

  let startBlock = job.data.startBlock;
  let endBlock = job.data.endBlock;

  // If no range specified, index next batch
  if (!startBlock) {
    startBlock = await indexer.getLastIndexedBlock() + 1;
  }

  if (!endBlock) {
    const currentBlock = await indexer.getCurrentBlockNumber();
    const batchSize = parseInt(process.env.INDEXER_BATCH_SIZE || '100', 10);
    endBlock = Math.min(startBlock + batchSize - 1, currentBlock);
  }

  logger.log(`Indexing blocks ${startBlock} to ${endBlock}`);

  const indexed = await indexer.indexBlocks(startBlock, endBlock);

  logger.log(`Indexed ${indexed} blocks successfully`);

  return {
    startBlock,
    endBlock,
    indexed,
  };
}

const worker = new Worker('ethereum-indexer', processIndexing, {
  connection: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
  },
  limiter: {
    max: 1, // One indexing job at a time
    duration: 10000,
  },
});

worker.on('completed', (job) => {
  logger.log(`Job ${job.id} completed`);
});

worker.on('failed', (job, err) => {
  logger.error(`Job ${job?.id} failed: ${err.message}`);
});

logger.log('Ethereum indexer worker started');
