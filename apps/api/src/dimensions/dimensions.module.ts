import { Module } from '@nestjs/common';
import { DimensionsController } from './dimensions.controller';
import { DimensionsService } from './dimensions.service';

/**
 * Module for multi-dimensional accounting
 * Manages 7 first-class dimensions
 */
@Module({
  controllers: [DimensionsController],
  providers: [DimensionsService],
  exports: [DimensionsService],
})
export class DimensionsModule {}
