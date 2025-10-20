import { Module } from '@nestjs/common';
import { WalletReconciliationController } from './wallet-reconciliation.controller';
import { WalletReconciliationService } from './wallet-reconciliation.service';
import { PrismaModule } from '../prisma/prisma.module';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [PrismaModule, ConfigModule],
  controllers: [WalletReconciliationController],
  providers: [WalletReconciliationService],
  exports: [WalletReconciliationService],
})
export class WalletReconciliationModule {}
