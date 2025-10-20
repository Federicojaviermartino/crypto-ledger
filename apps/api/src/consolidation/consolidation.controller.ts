import { Controller, Get, Post, Body, Query } from '@nestjs/common';
import { ConsolidationService } from './consolidation.service';

/**
 * Controller for consolidation operations
 */
@Controller('consolidations')
export class ConsolidationController {
  constructor(private readonly consolidationService: ConsolidationService) {}

  @Post('run')
  async runConsolidation(@Body() data: {
    period: string;
    reportingCurrency: string;
    asOfDate: string;
  }) {
    return this.consolidationService.runConsolidation(
      data.period,
      data.reportingCurrency,
      new Date(data.asOfDate)
    );
  }

  @Get()
  async getConsolidation(
    @Query('period') period: string,
    @Query('currency') currency: string,
  ) {
    return this.consolidationService.getConsolidation(period, currency);
  }

  @Post('fx-rates')
  async storeRate(@Body() data: {
    fromCurrency: string;
    toCurrency: string;
    date: string;
    rate: number;
  }) {
    await this.consolidationService.storeExchangeRate({
      ...data,
      date: new Date(data.date),
    });

    return { success: true };
  }

  @Get('fx-rates')
  async getRate(
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('date') date: string,
  ) {
    const rate = await this.consolidationService.getExchangeRate(
      from,
      to,
      new Date(date)
    );

    return { from, to, date, rate };
  }
}
