import { Controller, Get, Post, Param, Query } from '@nestjs/common';
import { PricingService } from './pricing.service';

/**
 * Controller for pricing operations
 */
@Controller('pricing')
export class PricingController {
  constructor(private readonly pricingService: PricingService) {}

  @Get('current/:asset/:quote')
  async getCurrentPrice(
    @Param('asset') asset: string,
    @Param('quote') quote: string,
  ) {
    const price = await this.pricingService.getCurrentPrice(asset, quote);
    return { asset, quote, price, timestamp: new Date() };
  }

  @Get('historical/:asset/:quote')
  async getHistoricalPrice(
    @Param('asset') asset: string,
    @Param('quote') quote: string,
    @Query('date') date: string,
  ) {
    if (!date) {
      throw new Error('date parameter is required');
    }

    const price = await this.pricingService.getHistoricalPrice(
      asset,
      quote,
      new Date(date),
    );

    return { asset, quote, date, price };
  }

  @Post('backfill/:asset/:quote')
  async backfillPrices(
    @Param('asset') asset: string,
    @Param('quote') quote: string,
    @Query('days') days?: string,
  ) {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days || '90', 10));

    const filled = await this.pricingService.backfillPrices(
      asset,
      quote,
      startDate,
      endDate,
    );

    return { asset, quote, filled, startDate, endDate };
  }
}
