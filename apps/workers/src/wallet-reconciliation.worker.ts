import { Worker, Job } from 'bullmq';
import { PrismaClient } from '@prisma/client';
import { ReconciliationEngine } from '@crypto-ledger/crypto/wallet-reconciliation/reconciliation-engine';
import { AlertService } from '@crypto-ledger/crypto/wallet-reconciliation/alert-service';
import { Logger } from '@nestjs/common';

const prisma = new PrismaClient();
const logger = new Logger('WalletReconciliation');

interface ReconciliationJobData {
  walletAccountId?: string;
  threshold?: number;
  alertThreshold?: number;
}

async function reconcileWallets(job: Job<ReconciliationJobData>) {
  const { walletAccountId, threshold = 0.01, alertThreshold = 1 } = job.data;

  const rpcUrl = process.env.ETH_RPC_URL || 'https://ethereum.publicnode.com';
  const engine = new ReconciliationEngine(prisma, rpcUrl);

  const alertService = new AlertService(
    process.env.WEBHOOK_URL,
    process.env.EMAIL_API_KEY ? {
      apiKey: process.env.EMAIL_API_KEY,
      from: process.env.EMAIL_FROM || 'alerts@example.com',
      to: (process.env.ALERT_EMAILS || '').split(',').filter(Boolean),
    } : undefined
  );

  logger.log('Starting wallet reconciliation');

  let results;
  
  if (walletAccountId) {
    results = await engine.reconcileWallet(walletAccountId, { threshold });
  } else {
    results = await engine.reconcileAllWallets({ threshold });
  }

  logger.log(`Reconciled ${results.length} wallet-asset pairs`);

  // Generate alerts for significant variances
  const alerts = results
    .filter(r => !r.isWithinThreshold && Math.abs(r.variance) >= alertThreshold)
    .map(r => ({
      walletAddress: r.address,
      asset: r.asset,
      variance: r.variance,
      variancePercent: r.variancePercent,
      message: `Wallet ${r.address} has a ${r.variancePercent.toFixed(2)}% variance for ${r.asset}`,
      severity: (Math.abs(r.variancePercent) > 10 ? 'critical' : 'warning') as 'warning' | 'critical',
    }));

  if (alerts.length > 0) {
    logger.warn(`Generated ${alerts.length} alerts`);
    await alertService.sendBatchAlert(alerts);

    // Mark alerts as sent
    const reconciliationIds = results
      .filter(r => !r.isWithinThreshold && Math.abs(r.variance) >= alertThreshold)
      .map(r => r.walletAccountId);

    await prisma.walletReconciliation.updateMany({
      where: {
        walletAccountId: { in: reconciliationIds },
        alertSent: false,
      },
      data: {
        alertSent: true,
        alertSentAt: new Date(),
      },
    });
  }

  return {
    totalReconciled: results.length,
    withinThreshold: results.filter(r => r.isWithinThreshold).length,
    outOfThreshold: results.filter(r => !r.isWithinThreshold).length,
    alertsGenerated: alerts.length,
  };
}

const worker = new Worker('wallet-reconciliation', reconcileWallets, {
  connection: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
  },
  limiter: {
    max: 5,
    duration: 60000,
  },
});

worker.on('completed', (job) => {
  logger.log(`Job ${job.id} completed:`, job.returnvalue);
});

worker.on('failed', (job, err) => {
  logger.error(`Job ${job?.id} failed: ${err.message}`);
});

logger.log('Wallet reconciliation worker started');
