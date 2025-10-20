
import 'dotenv/config';
import { Worker, Queue } from 'bullmq';
import IORedis from 'ioredis';
import { JsonRpcProvider } from 'ethers';
import { syncWallet } from './sync/ethereum';

const connection = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
});

// Queues
export const syncQueue = new Queue('crypto.sync.ethereum', { connection });

// Worker to process Ethereum sync tasks
new Worker('crypto.sync.ethereum', async (job) => {
  const { wallet, fromBlock } = job.data as { wallet: string; fromBlock: number };
  const provider = new JsonRpcProvider(process.env.ETH_RPC_URL);
  await syncWallet(provider, wallet, fromBlock);
}, { connection });

console.log('Workers running.');
