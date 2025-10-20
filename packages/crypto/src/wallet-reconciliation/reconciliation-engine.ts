import { PrismaClient } from '@prisma/client';
import { BalanceChecker } from './balance-checker';
import { BookBalanceCalculator } from './book-balance-calculator';
import { WalletReconciliationResult } from '@crypto-ledger/shared/types/wallet-reconciliation.types';

export class ReconciliationEngine {
  private balanceChecker: BalanceChecker;
  private bookCalculator: BookBalanceCalculator;

  constructor(
    private prisma: PrismaClient,
    rpcUrl: string
  ) {
    this.balanceChecker = new BalanceChecker(rpcUrl);
    this.bookCalculator = new BookBalanceCalculator(prisma);
  }

  async reconcileWallet(
    walletAccountId: string,
    options: {
      assets?: string[];
      threshold?: number;
      tokenAddresses?: string[];
    } = {}
  ): Promise<WalletReconciliationResult[]> {
    const { assets, threshold = 0.01, tokenAddresses = [] } = options;

    const walletAccount = await this.prisma.walletAccount.findUnique({
      where: { id: walletAccountId },
      include: { glAccount: true },
    });

    if (!walletAccount) {
      throw new Error(`Wallet account ${walletAccountId} not found`);
    }

    // Get on-chain balances
    const onChainBalances = await this.balanceChecker.getBalances(
      walletAccount.address,
      tokenAddresses
    );

    const results: WalletReconciliationResult[] = [];

    for (const onChainBalance of onChainBalances) {
      // Skip if not in requested assets
      if (assets && !assets.includes(onChainBalance.asset)) {
        continue;
      }

      // Get book balance
      const bookBalance = await this.bookCalculator.calculateBalance(
        walletAccount.glAccountId,
        onChainBalance.asset,
        onChainBalance.timestamp
      );

      // Calculate variance
      const variance = onChainBalance.balance - bookBalance.balance;
      const variancePercent = onChainBalance.balance !== 0
        ? (variance / onChainBalance.balance) * 100
        : 0;

      const isWithinThreshold = Math.abs(variance) <= threshold;

      // Create reconciliation record
      const reconciliation = await this.prisma.walletReconciliation.create({
        data: {
          walletAccountId,
          asset: onChainBalance.asset,
          onChainBalance: onChainBalance.balance,
          onChainBlockNumber: onChainBalance.blockNumber,
          onChainTimestamp: onChainBalance.timestamp,
          bookBalance: bookBalance.balance,
          bookAsOfDate: onChainBalance.timestamp,
          variance,
          variancePercent,
          isWithinThreshold,
          threshold,
          status: isWithinThreshold ? 'resolved' : 'pending',
        },
      });

      results.push({
        walletAccountId,
        address: walletAccount.address,
        asset: onChainBalance.asset,
        onChainBalance: onChainBalance.balance,
        bookBalance: bookBalance.balance,
        variance,
        variancePercent,
        isWithinThreshold,
        threshold,
        status: reconciliation.status,
      });
    }

    return results;
  }

  async reconcileAllWallets(
    options: {
      threshold?: number;
      chain?: string;
      network?: string;
    } = {}
  ): Promise<WalletReconciliationResult[]> {
    const { threshold = 0.01, chain, network } = options;

    const wallets = await this.prisma.walletAccount.findMany({
      where: {
        isActive: true,
        chain,
        network,
      },
    });

    const allResults: WalletReconciliationResult[] = [];

    for (const wallet of wallets) {
      try {
        const results = await this.reconcileWallet(wallet.id, { threshold });
        allResults.push(...results);
      } catch (error) {
        console.error(`Error reconciling wallet ${wallet.address}:`, error);
      }
    }

    return allResults;
  }

  async getUnreconciledItems(
    options: {
      minVariance?: number;
      chain?: string;
    } = {}
  ): Promise<WalletReconciliationResult[]> {
    const { minVariance = 0.01, chain } = options;

    const reconciliations = await this.prisma.walletReconciliation.findMany({
      where: {
        isWithinThreshold: false,
        status: { in: ['pending', 'investigating'] },
        walletAccount: chain ? { chain } : undefined,
      },
      include: {
        walletAccount: true,
      },
      orderBy: {
        variancePercent: 'desc',
      },
    });

    return reconciliations
      .filter(r => Math.abs(r.variance) >= minVariance)
      .map(r => ({
        walletAccountId: r.walletAccountId,
        address: r.walletAccount.address,
        asset: r.asset,
        onChainBalance: r.onChainBalance,
        bookBalance: r.bookBalance,
        variance: r.variance,
        variancePercent: r.variancePercent,
        isWithinThreshold: r.isWithinThreshold,
        threshold: r.threshold,
        status: r.status,
      }));
  }
}
