import { Controller, Get, Post, Body, Query } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';

/**
 * Analytics controller
 */
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Post('snapshots')
  async createSnapshot(@Body() body: { asOfDate: string }) {
    return this.analyticsService.createSnapshot(new Date(body.asOfDate));
  }

  @Get('snapshots')
  async listSnapshots() {
    return this.analyticsService.listSnapshots();
  }

  @Post('anomalies/detect')
  async detectAnomalies(
    @Body() body: { startDate: string; endDate: string },
  ) {
    return this.analyticsService.detectAnomalies(
      new Date(body.startDate),
      new Date(body.endDate),
    );
  }

  @Get('anomalies')
  async getAnomalies(
    @Query('status') status?: string,
    @Query('severity') severity?: string,
  ) {
    return this.analyticsService.getAnomalies(status, severity);
  }

  @Get('metrics')
  async getMetrics(@Query('asOfDate') asOfDate?: string) {
    const date = asOfDate ? new Date(asOfDate) : new Date();
    return this.analyticsService.calculateMetrics(date);
  }
}
