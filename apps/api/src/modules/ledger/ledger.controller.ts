
import { Body, Controller, Post } from '@nestjs/common';
import { CreateEntryDto } from '@ledger/shared';
import { LedgerService } from './ledger.service';

@Controller('entries')
export class LedgerController {
  constructor(private readonly ledger: LedgerService) {}

  @Post()
  create(@Body() dto: CreateEntryDto) {
    // In a real app, use the logged-in user id. For now, a placeholder is used.
    return this.ledger.createEntry(dto, 'system');
  }
}
