import { Controller, Post, Get, Param, Body } from '@nestjs/common';
import { SiiApiService } from './sii-api.service';

/**
 * Controller for SII operations
 */
@Controller('sii')
export class SiiController {
  constructor(private readonly siiService: SiiApiService) {}

  @Post('invoices/:id/submit')
  async submitInvoice(
    @Param('id') id: string,
    @Body() body: { submissionType?: 'issued' | 'received' },
  ) {
    return this.siiService.submitInvoice(id, body.submissionType || 'issued');
  }

  @Get('invoices/:id/status')
  async getStatus(@Param('id') id: string) {
    return this.siiService.getStatus(id);
  }

  @Get('overdue')
  async getOverdue() {
    return this.siiService.checkOverdue();
  }

  @Post('retry-failed')
  async retryFailed() {
    const count = await this.siiService.retryFailed();
    return { retriedCount: count };
  }
}
