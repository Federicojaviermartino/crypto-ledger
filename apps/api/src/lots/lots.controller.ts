import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { LotsService } from './lots.service';

/**
 * Controller for lot operations
 */
@Controller('lots')
export class LotsController {
  constructor(private readonly lotsService: LotsService) {}

  @Post()
  async createLot(@Body() data: {
    asset: string;
    quantity: number;
    costBasis: number;
    acquiredAt: string;
    acquiredFrom?: string;
  }) {
    return this.lotsService.createLot({
      ...data,
      acquiredAt: new Date(data.acquiredAt),
    });
  }

  @Post('dispose')
  async disposeLots(@Body() data: {
    asset: string;
    quantity: number;
    proceeds: number;
    disposedAt: string;
  }) {
    return this.lotsService.disposeLots({
      ...data,
      disposedAt: new Date(data.disposedAt),
    });
  }

  @Get('balances/:asset')
  async getBalances(@Param('asset') asset: string) {
    return this.lotsService.getLotBalances(asset);
  }

  @Get('pnl')
  async getPnL(
    @Query('asset') asset?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    if (!startDate || !endDate) {
      throw new Error('startDate and endDate are required');
    }

    return this.lotsService.getRealizedPnL({
      asset,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
    });
  }
}
