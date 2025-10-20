import { Controller, Get, Post, Body, Param, Query, UseGuards } from '@nestjs/common';
import { InsightsService } from './insights.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('insights')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class InsightsController {
  constructor(private readonly insightsService: InsightsService) {}

  @Post('anomalies/detect')
  @RequirePermissions({ resource: 'insights', action: 'create' })
  async detectAnomalies(
    @Body() body: { startDate: string; endDate: string }
  ) {
    return this.insightsService.detectAnomalies(
      new Date(body.startDate),
      new Date(body.endDate)
    );
  }

  @Get('anomalies')
  @RequirePermissions({ resource: 'insights', action: 'read' })
  async getAnomalies(
    @Query('status') status?: string,
    @Query('severity') severity?: string,
    @Query('type') type?: string,
    @Query('limit') limit?: string,
  ) {
    return this.insightsService.getAnomalies({
      status,
      severity,
      type,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Post('anomalies/:id/resolve')
  @RequirePermissions({ resource: 'insights', action: 'update' })
  async resolveAnomaly(
    @Param('id') id: string,
    @Body() body: { resolution: string },
    @CurrentUser() user: any,
  ) {
    return this.insightsService.resolveAnomaly(id, user.userId, body.resolution);
  }

  @Get('metrics')
  @RequirePermissions({ resource: 'insights', action: 'read' })
  async getMetrics(@Query('asOfDate') asOfDate?: string) {
    const date = asOfDate ? new Date(asOfDate) : new Date();
    return this.insightsService.calculateMetrics(date);
  }

  @Get('metrics/:type/history')
  @RequirePermissions({ resource: 'insights', action: 'read' })
  async getMetricHistory(
    @Param('type') type: string,
    @Query('days') days?: string,
  ) {
    return this.insightsService.getMetricHistory(
      type,
      days ? parseInt(days, 10) : undefined
    );
  }
}
