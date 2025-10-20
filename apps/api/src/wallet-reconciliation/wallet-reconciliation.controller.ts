import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { WalletReconciliationService } from './wallet-reconciliation.service';
import { WalletAccountInfo } from '@crypto-ledger/shared/types/wallet-reconciliation.types';

@Controller('wallet-reconciliation')
export class WalletReconciliationController {
  constructor(private readonly service: WalletReconciliationService) {}

  @Post('wallets')
  async createWallet(@Body() accountInfo: WalletAccountInfo) {
    return this.service.createWalletAccount(accountInfo);
  }

  @Post('reconcile/:walletAccountId')
  async reconcileWallet(
    @Param('walletAccountId') walletAccountId: string,
    @Body() body: { threshold?: number },
  ) {
    return this.service.reconcileWallet(walletAccountId, body.threshold);
  }

  @Post('reconcile-all')
  async reconcileAll(@Body() body: { threshold?: number }) {
    return this.service.reconcileAllWallets(body.threshold);
  }

  @Get('unreconciled')
  async getUnreconciled(@Query('minVariance') minVariance?: string) {
    return this.service.getUnreconciledItems(
      minVariance ? parseFloat(minVariance) : undefined
    );
  }

  @Get('history/:walletAccountId')
  async getHistory(
    @Param('walletAccountId') walletAccountId: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.getReconciliationHistory(
      walletAccountId,
      limit ? parseInt(limit, 10) : 50
    );
  }

  @Post(':id/resolve')
  async resolve(
    @Param('id') id: string,
    @Body() body: { userId: string; resolution: string },
  ) {
    return this.service.resolveReconciliation(id, body.userId, body.resolution);
  }
}
