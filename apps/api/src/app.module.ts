import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { EntriesModule } from './entries/entries.module';
import { AccountsModule } from './accounts/accounts.module';
import { DimensionsModule } from './dimensions/dimensions.module';
import { BlockchainModule } from './blockchain/blockchain.module';
import { LotsModule } from './lots/lots.module';
import { PricingModule } from './pricing/pricing.module';
import { EntitiesModule } from './entities/entities.module';
import { ConsolidationModule } from './consolidation/consolidation.module';
import { InvoicesModule } from './invoices/invoices.module';
import { PartiesModule } from './parties/parties.module';
import { ReconciliationModule } from './reconciliation/reconciliation.module';
import { envValidationSchema } from './config/env.validation';
import { SecurityHeadersMiddleware } from './common/middleware/security-headers.middleware';
import { AnalyticsModule } from './analytics/analytics.module';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';

/**
 * Root application module
 * Imports all feature modules and configures global settings
 */
@Module({
  imports: [
    // Global configuration
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      validationSchema: envValidationSchema,
    }),

    // Database
    PrismaModule,

    // Core features
    EntriesModule,
    AccountsModule,
    DimensionsModule,

    // Blockchain features
    BlockchainModule,
    LotsModule,
    PricingModule,

    // Multi-entity features
    EntitiesModule,
    ConsolidationModule,

    // Invoicing features
    InvoicesModule,

    // Parties features
    PartiesModule,

    // Reconciliation features
    ReconciliationModule,

    // Analytics
    AnalyticsModule,

    // Health
    HealthModule,

    // Authentication
    AuthModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(SecurityHeadersMiddleware).forRoutes('*');
  }
}