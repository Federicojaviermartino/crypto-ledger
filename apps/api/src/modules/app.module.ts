
import { Module } from '@nestjs/common';
import { LedgerModule } from './ledger/ledger.module';
import { HealthController } from './health.controller';
import { PrismaService } from '../services/prisma.service';
import { AuditService } from '../services/audit.service';

@Module({
  imports: [LedgerModule],
  controllers: [HealthController],
  providers: [PrismaService, AuditService],
})
export class AppModule {}
