import { Controller, Get, Post, Param, Query, Body } from '@nestjs/common';
import { OpsService } from './ops.service';

@Controller('ops')
export class OpsController {
  constructor(private readonly opsService: OpsService) {}

  @Get('health')
  async getHealth(@Query('period') period?: string) {
    return this.opsService.getHealth(period);
  }

  @Get('checklist/:period')
  async getChecklist(@Param('period') period: string) {
    return this.opsService.getCloseChecklist(period);
  }

  @Get('issues')
  async getOpenIssues(@Query('period') period?: string) {
    return this.opsService.getOpenIssues(period);
  }

  @Post('issues/:id/resolve')
  async resolveIssue(
    @Param('id') id: string,
    @Body() body: { resolution: string; resolvedBy: string },
  ) {
    return this.opsService.resolveIssue(id, body.resolution, body.resolvedBy);
  }

  @Post('close/:period')
  async closePeriod(
    @Param('period') period: string,
    @Body() body: { closedBy: string },
  ) {
    return this.opsService.closePeriod(period, body.closedBy);
  }
}
