import { Module } from '@nestjs/common';
import { SiiController } from './sii.controller';
import { SiiApiService } from './sii-api.service';
import { ConfigModule } from '@nestjs/config';

/**
 * Module for SII (Spanish Tax) operations
 */
@Module({
  imports: [ConfigModule],
  controllers: [SiiController],
  providers: [SiiApiService],
  exports: [SiiApiService],
})
export class SiiModule {}
