import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * Prisma service for database operations
 * Handles connection lifecycle and provides transaction support
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      log: process.env.NODE_ENV === 'development' 
        ? ['query', 'error', 'warn'] 
        : ['error'],
    });
  }

  /**
   * Connect to database on module initialization
   */
  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('✅ Database connected successfully');
  }

  /**
   * Disconnect from database on module destruction
   */
  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    this.logger.log('👋 Database disconnected');
  }

  /**
   * Execute operations within a transaction
   * Ensures atomicity for complex operations
   */
  async executeTransaction<T>(
    callback: (tx: Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use'>) => Promise<T>,
  ): Promise<T> {
    return this.$transaction(callback);
  }
}
