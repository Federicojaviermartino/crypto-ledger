import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { ReconciliationEngine } from '@crypto-ledger/crypto/wallet-reconciliation/reconciliation-engine';
import { WalletAccountInfo } from '@crypto-ledger/shared/types/wallet-reconciliation.types';

@Injectable()
export class WalletReconciliationService {
  private engine: ReconciliationEngine;

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {
    const rpcUrl = this.config.get('ETH_RPC_URL') || 'https://ethereum.publicnode.com';
    this.engine = new ReconciliationEngine(prisma, rpcUrl);
  }

  async createWalletAccount(accountInfo: WalletAccountInfo) {
    const glAccount = await this.prisma.account.findUnique({
      where: { code: accountInfo.glAccountCode },
    });

    if (!glAccount) {
      throw new Error(`GL account ${accountInfo.glAccountCode} not found`);
    }

    return this.prisma.walletAccount.create({
      data: {
        address: accountInfo.address.toLowerCase(),
        chain: accountInfo.chain,
        network: accountInfo.network,
        label: accountInfo.label,
        glAccountId: glAccount.id,
        entityId: accountInfo.entityId,
      },
    });
  }

  async reconcileWallet(walletAccountId: string, threshold?: number) {
    return this.engine.reconcileWallet(walletAccountId, { threshold });
  }

  async reconcileAllWallets(threshold?: number) {
    return this.engine.reconcileAllWallets({ threshold });
  }

  async getUnreconciledItems(minVariance?: number) {
    return this.engine.getUnreconciledItems({ minVariance });
  }

  async getReconciliationHistory(walletAccountId: string, limit: number = 50) {
    return this.prisma.walletReconciliation.findMany({
      where: { walletAccountId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        walletAccount: {
          include: {
            glAccount: true,
          },
        },
      },
    });
  }

  async resolveReconciliation(reconciliationId: string, userId: string, resolution: string) {
    return this.prisma.walletReconciliation.update({
      where: { id: reconciliationId },
      data: {
        status: 'resolved',
        resolvedAt: new Date(),
        resolvedBy: userId,
        resolution,
      },
    });
  }
}
