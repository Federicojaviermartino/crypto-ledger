import { Module } from '@nestjs/common';
import { ConsolidationController } from './consolidation.controller';
import { ConsolidationService } from './consolidation.service';

/**
 * Module for consolidation operations
 */
@Module({
  controllers: [ConsolidationController],
  providers: [ConsolidationService],
  exports: [ConsolidationService],
})
export class ConsolidationModule {}
