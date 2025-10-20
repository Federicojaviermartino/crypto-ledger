
import { Module } from '@nestjs/common';
import { LedgerController } from './ledger.controller';
import { LedgerService } from './ledger.service';
import { PrismaService } from '../../services/prisma.service';
import { AuditService } from '../../services/audit.service';

@Module({
  controllers: [LedgerController],
  providers: [LedgerService, PrismaService, AuditService],
  exports: [LedgerService],
})
export class LedgerModule {}
