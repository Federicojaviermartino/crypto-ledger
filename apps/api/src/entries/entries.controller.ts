import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { EntriesService } from './entries.service';
import { CreateEntryDto } from './dto/create-entry.dto';

/**
 * Controller for journal entry operations
 * Handles CRUD and hash chain verification
 */
@Controller('entries')
export class EntriesController {
  constructor(private readonly entriesService: EntriesService) {}

  /**
   * Create a new journal entry
   */
  @Post()
  async create(@Body() createEntryDto: CreateEntryDto) {
    return this.entriesService.create(createEntryDto);
  }

  /**
   * List entries with optional filters
   */
  @Get()
  async findAll(
    @Query('skip') skip?: string,
    @Query('take') take?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.entriesService.findAll({
      skip: skip ? parseInt(skip, 10) : undefined,
      take: take ? parseInt(take, 10) : undefined,
      startDate,
      endDate,
    });
  }

  /**
   * Get single entry by ID
   */
  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.entriesService.findOne(id);
  }

  /**
   * Get hash chain proof for entry
   */
  @Get(':id/proof')
  async getProof(@Param('id') id: string) {
    return this.entriesService.getHashProof(id);
  }

  /**
   * Verify entire hash chain
   */
  @Get('verify/chain')
  async verifyChain(
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.entriesService.verifyChain(from, to);
  }
}