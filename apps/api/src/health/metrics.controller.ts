import { Controller, Get } from '@nestjs/common';
import { ObservabilityService } from '../services/observability.service';

/**
 * Metrics endpoint for Prometheus scraping
 */
@Controller('metrics')
export class MetricsController {
  constructor(private readonly observability: ObservabilityService) {}

  @Get()
  async getMetrics(): Promise<string> {
    return this.observability.getMetrics();
  }

  @Get('health')
  async getHealth() {
    return this.observability.checkSLOs();
  }
}
