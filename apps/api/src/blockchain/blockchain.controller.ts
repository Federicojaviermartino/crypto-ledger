import { Controller, Get, Post, Param, Query } from '@nestjs/common';
import { BlockchainService } from './blockchain.service';

/**
 * Controller for blockchain operations
 */
@Controller('blockchain')
export class BlockchainController {
  constructor(private readonly blockchainService: BlockchainService) {}

  @Get('events')
  async getEvents(
    @Query('processed') processed?: string,
    @Query('classifiedAs') classifiedAs?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    return this.blockchainService.getEvents({
      processed: processed ? processed === 'true' : undefined,
      classifiedAs,
      from,
      to,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      skip: skip ? parseInt(skip, 10) : undefined,
      take: take ? parseInt(take, 10) : undefined,
    });
  }

  @Get('events/:id')
  async getEvent(@Param('id') id: string) {
    return this.blockchainService.getEvent(id);
  }

  @Post('events/:id/classify')
  async classifyEvent(@Param('id') id: string) {
    return this.blockchainService.classifyEvent(id);
  }

  @Get('status')
  async getStatus() {
    return this.blockchainService.getStatus();
  }
}
