import { Controller, Get, Post, Body, Param } from '@nestjs/common';
import { AccountsService } from './accounts.service';

/**
 * Controller for chart of accounts
 */
@Controller('accounts')
export class AccountsController {
  constructor(private readonly accountsService: AccountsService) {}

  @Post()
  async create(@Body() data: {
    code: string;
    name: string;
    type: string;
    parentId?: string;
  }) {
    return this.accountsService.create(data);
  }

  @Get()
  async findAll() {
    return this.accountsService.findAll();
  }

  @Get(':code')
  async findByCode(@Param('code') code: string) {
    return this.accountsService.findByCode(code);
  }
}
