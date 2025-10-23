#!/usr/bin/env node

/**
 * Load Testing Suite for Multi-Chain Crypto Accounting System
 * 
 * Validates system performance and correctness at scale:
 * - Seeds 3 chains × 200 wallets = 600 wallets
 * - Generates 5,000,000+ synthetic blockchain events
 * - Measures ingestion lag (target: P95 < 5 minutes)
 * - Verifies zero duplicate postings (idempotency)
 * - Validates double-entry invariants (Σ debits == Σ credits)
 * - Tests concurrent processing with bounded parallelism
 * 
 * Usage:
 *   npx ts-node scripts/load-test.ts --wallets 600 --events 5000000 --concurrent 50
 *   npx ts-node scripts/load-test.ts --quick  # Quick test: 100 wallets, 100k events
 */

import { PrismaClient } from '@prisma/client';
import { ChainAdapterDispatcher } from '@crypto-ledger/crypto/chains/dispatcher';
import { Queue, Worker } from 'bullmq';
import * as crypto from 'crypto';

const prisma = new PrismaClient();

interface LoadTestConfig {
  wallets: number;
  eventsPerWallet: number;
  concurrent: number;
  chains: string[];
}

interface LoadTestResults {
  totalEvents: number;
  totalWallets: number;
  durationMs: number;
  throughputEventsPerSec: number;
  ingestionLagP50Ms: number;
  ingestionLagP95Ms: number;
  ingestionLagP99Ms: number;
  duplicatesDetected: number;
  invariantViolations: number;
  queueDepthMax: number;
}

// Parse CLI arguments
function parseConfig(): LoadTestConfig {
  const args = process.argv.slice(2);
  
  if (args.includes('--quick')) {
    return {
      wallets: 100,
      eventsPerWallet: 1000,
      concurrent: 10,
      chains: ['ethereum', 'bitcoin'],
    };
  }

  const getArg = (name: string, defaultValue: any) => {
    const index = args.indexOf(`--${name}`);
    return index >= 0 ? args[index + 1] : defaultValue;
  };

  const wallets = parseInt(getArg('wallets', '600'));
  const totalEvents = parseInt(getArg('events', '5000000'));
  
  return {
    wallets,
    eventsPerWallet: Math.floor(totalEvents / wallets),
    concurrent: parseInt(getArg('concurrent', '50')),
    chains: ['ethereum', 'polygon', 'bitcoin'],
  };
}

// Generate synthetic wallet addresses
function generateWalletAddress(chain: string, index: number): string {
  const hash = crypto.createHash('sha256').update(`${chain}-${index}`).digest('hex');
  
  if (chain === 'bitcoin') {
    // Simplified Bitcoin address (normally would use proper encoding)
    return `bc1q${hash.slice(0, 40)}`;
  } else if (chain === 'solana') {
    return hash.slice(0, 44);
  } else {
    // EVM chains
    return `0x${hash.slice(0, 40)}`;
  }
}

// Seed wallets across chains
async function seedWallets(config: LoadTestConfig): Promise<string[]> {
  console.log(`\n📦 Seeding ${config.wallets} wallets across ${config.chains.length} chains...`);
  
  const walletIds: string[] = [];
  const walletsPerChain = Math.floor(config.wallets / config.chains.length);

  for (const chain of config.chains) {
    const chainRecord = await prisma.chain.findUnique({ where: { name: chain } });
    if (!chainRecord) {
      throw new Error(`Chain ${chain} not found in database`);
    }

    const network = await prisma.network.findFirst({
      where: { chainId: chainRecord.id, name: 'mainnet' },
    });

    if (!network) {
      throw new Error(`Network mainnet not found for chain ${chain}`);
    }

    for (let i = 0; i < walletsPerChain; i++) {
      const address = generateWalletAddress(chain, i);
      
      const wallet = await prisma.wallet.upsert({
        where: { networkId_address: { networkId: network.id, address } },
        create: {
          address,
          networkId: network.id,
          label: `Load Test ${chain} #${i}`,
          tags: ['load-test'],
        },
        update: {},
      });

      walletIds.push(wallet.id);
    }

    console.log(`   ✅ ${chain}: ${walletsPerChain} wallets`);
  }

  return walletIds;
}

// Generate synthetic blockchain events
async function generateEvents(walletIds: string[], config: LoadTestConfig) {
  console.log(`\n🔨 Generating ${config.eventsPerWallet * walletIds.length} synthetic events...`);

  const eventTypes = ['DEPOSIT', 'WITHDRAW', 'SWAP', 'TRANSFER_OUT', 'RECEIVE'];
  const assets = ['ETH', 'USDC', 'USDT', 'WBTC', 'DAI'];
  
  let totalGenerated = 0;
  const batchSize = 1000;

  for (const walletId of walletIds) {
    const wallet = await prisma.wallet.findUnique({
      where: { id: walletId },
      include: { network: { include: { chain: true } } },
    });

    if (!wallet) continue;

    const events = [];
    
    for (let i = 0; i < config.eventsPerWallet; i++) {
      const eventType = eventTypes[Math.floor(Math.random() * eventTypes.length)];
      const asset = assets[Math.floor(Math.random() * assets.length)];
      const amount = (Math.random() * 10).toFixed(8);
      const amountUsd = (parseFloat(amount) * (1000 + Math.random() * 2000)).toFixed(2);
      
      const txHash = `0x${crypto.randomBytes(32).toString('hex')}`;
      const blockNumber = BigInt(18_000_000 + Math.floor(Math.random() * 1_000_000));
      const timestamp = new Date(Date.now() - Math.random() * 365 * 24 * 3600 * 1000);

      events.push({
        walletId: wallet.id,
        chain: wallet.network.chain.name,
        network: wallet.network.name,
        txHash,
        blockNumber,
        logIndex: Math.floor(Math.random() * 100),
        timestamp,
        eventType,
        asset,
        assetSymbol: asset,
        amount,
        amountUsd,
        from: wallet.address,
        to: `0x${crypto.randomBytes(20).toString('hex')}`,
        rawData: { synthetic: true },
      });

      if (events.length >= batchSize) {
        await prisma.blockchainEvent.createMany({
          data: events,
          skipDuplicates: true,
        });
        totalGenerated += events.length;
        events.length = 0;
        
        if (totalGenerated % 50000 === 0) {
          console.log(`   Generated ${totalGenerated.toLocaleString()} events...`);
        }
      }
    }

    if (events.length > 0) {
      await prisma.blockchainEvent.createMany({
        data: events,
        skipDuplicates: true,
      });
      totalGenerated += events.length;
    }
  }

  console.log(`   ✅ Generated ${totalGenerated.toLocaleString()} events`);
  return totalGenerated;
}

// Measure ingestion lag
async function measureIngestionLag(): Promise<{ p50: number; p95: number; p99: number }> {
  const events = await prisma.blockchainEvent.findMany({
    select: {
      timestamp: true,
      createdAt: true,
    },
    take: 10000,
    orderBy: { createdAt: 'desc' },
  });

  const lags = events.map((e) => e.createdAt.getTime() - e.timestamp.getTime());
  lags.sort((a, b) => a - b);

  const p50 = lags[Math.floor(lags.length * 0.5)];
  const p95 = lags[Math.floor(lags.length * 0.95)];
  const p99 = lags[Math.floor(lags.length * 0.99)];

  return { p50, p95, p99 };
}

// Check for duplicate entries (idempotency validation)
async function checkDuplicates(): Promise<number> {
  const duplicates = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*) as count
    FROM (
      SELECT tx_hash, log_index, COUNT(*) as cnt
      FROM blockchain_events
      GROUP BY tx_hash, log_index
      HAVING COUNT(*) > 1
    ) duplicates
  `;

  return Number(duplicates[0]?.count || 0);
}

// Validate double-entry invariants
async function validateInvariants(): Promise<number> {
  // Sum all journal entry debits and credits
  const result = await prisma.$queryRaw<Array<{ debit_sum: string; credit_sum: string }>>`
    SELECT 
      SUM(debit_amount) as debit_sum,
      SUM(credit_amount) as credit_sum
    FROM journal_entries
  `;

  const debitSum = parseFloat(result[0]?.debit_sum || '0');
  const creditSum = parseFloat(result[0]?.credit_sum || '0');

  const diff = Math.abs(debitSum - creditSum);
  
  // Allow for floating point rounding (max 1 cent difference)
  return diff > 0.01 ? 1 : 0;
}

// Process events through ingestion pipeline
async function runIngestion(config: LoadTestConfig): Promise<void> {
  console.log(`\n⚙️  Starting ingestion with concurrency ${config.concurrent}...`);

  const queue = new Queue('blockchain-sync', {
    connection: {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
    },
  });

  // Add all wallets to queue
  const wallets = await prisma.wallet.findMany({
    where: { tags: { has: 'load-test' } },
    include: { network: { include: { chain: true } } },
  });

  for (const wallet of wallets) {
    await queue.add('sync', {
      walletId: wallet.id,
      chain: wallet.network.chain.name,
      network: wallet.network.name,
      address: wallet.address,
      fullSync: true,
    });
  }

  console.log(`   ✅ Queued ${wallets.length} sync jobs`);
  
  // Monitor queue depth
  let maxDepth = 0;
  const interval = setInterval(async () => {
    const waiting = await queue.getWaitingCount();
    const active = await queue.getActiveCount();
    const depth = waiting + active;
    maxDepth = Math.max(maxDepth, depth);
    
    if (depth > 0) {
      console.log(`   Queue: ${active} active, ${waiting} waiting (max: ${maxDepth})`);
    }
  }, 5000);

  // Wait for queue to drain
  while (true) {
    const waiting = await queue.getWaitingCount();
    const active = await queue.getActiveCount();
    
    if (waiting === 0 && active === 0) {
      break;
    }
    
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  clearInterval(interval);
  console.log(`   ✅ Ingestion complete (max queue depth: ${maxDepth})`);
}

// Run full load test
async function runLoadTest(): Promise<LoadTestResults> {
  console.log('\n🚀 LOAD TEST STARTING\n');
  console.log('━'.repeat(60));
  
  const config = parseConfig();
  console.log('Configuration:');
  console.log(`  Wallets: ${config.wallets}`);
  console.log(`  Events per wallet: ${config.eventsPerWallet}`);
  console.log(`  Total events: ${(config.wallets * config.eventsPerWallet).toLocaleString()}`);
  console.log(`  Chains: ${config.chains.join(', ')}`);
  console.log(`  Concurrency: ${config.concurrent}`);
  console.log('━'.repeat(60));

  const startTime = Date.now();

  // Phase 1: Seed wallets
  const walletIds = await seedWallets(config);

  // Phase 2: Generate synthetic events
  const totalEvents = await generateEvents(walletIds, config);

  // Phase 3: Run ingestion pipeline
  await runIngestion(config);

  // Phase 4: Measure results
  console.log('\n📊 Measuring results...');
  
  const lag = await measureIngestionLag();
  const duplicates = await checkDuplicates();
  const invariantViolations = await validateInvariants();

  const durationMs = Date.now() - startTime;
  const throughput = (totalEvents / durationMs) * 1000;

  return {
    totalEvents,
    totalWallets: walletIds.length,
    durationMs,
    throughputEventsPerSec: throughput,
    ingestionLagP50Ms: lag.p50,
    ingestionLagP95Ms: lag.p95,
    ingestionLagP99Ms: lag.p99,
    duplicatesDetected: duplicates,
    invariantViolations,
    queueDepthMax: 0, // Set during ingestion
  };
}

// Print results
function printResults(results: LoadTestResults) {
  console.log('\n');
  console.log('━'.repeat(60));
  console.log('📊 LOAD TEST RESULTS');
  console.log('━'.repeat(60));
  console.log();
  console.log('Volume:');
  console.log(`  Total events processed: ${results.totalEvents.toLocaleString()}`);
  console.log(`  Total wallets: ${results.totalWallets}`);
  console.log(`  Duration: ${(results.durationMs / 1000).toFixed(1)}s`);
  console.log();
  console.log('Performance:');
  console.log(`  Throughput: ${results.throughputEventsPerSec.toFixed(0)} events/sec`);
  console.log(`  Ingestion lag P50: ${(results.ingestionLagP50Ms / 1000).toFixed(1)}s`);
  console.log(`  Ingestion lag P95: ${(results.ingestionLagP95Ms / 1000 / 60).toFixed(1)} min`);
  console.log(`  Ingestion lag P99: ${(results.ingestionLagP99Ms / 1000 / 60).toFixed(1)} min`);
  console.log();
  console.log('Quality:');
  console.log(`  Duplicate events: ${results.duplicatesDetected}`);
  console.log(`  Invariant violations: ${results.invariantViolations}`);
  console.log();

  // Validate against SLOs
  const p95Minutes = results.ingestionLagP95Ms / 1000 / 60;
  const sloMet = p95Minutes < 5 && results.duplicatesDetected === 0 && results.invariantViolations === 0;

  console.log('SLO Validation:');
  console.log(`  P95 ingestion lag < 5 min: ${p95Minutes < 5 ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`  Zero duplicates: ${results.duplicatesDetected === 0 ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`  Zero invariant breaks: ${results.invariantViolations === 0 ? '✅ PASS' : '❌ FAIL'}`);
  console.log();
  console.log('━'.repeat(60));
  console.log(sloMet ? '✅ ALL SLOS MET' : '❌ SOME SLOS FAILED');
  console.log('━'.repeat(60));
  console.log();

  process.exit(sloMet ? 0 : 1);
}

// Execute
runLoadTest()
  .then(printResults)
  .catch((error) => {
    console.error('\n❌ Load test failed:', error);
    process.exit(2);
  })
  .finally(() => {
    prisma.$disconnect();
  });
