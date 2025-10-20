import { Controller, Get, Post, Put, Body, Param, Query } from '@nestjs/common';
import { PartiesService } from './parties.service';

/**
 * Controller for party (customer/supplier) management
 */
@Controller('parties')
export class PartiesController {
  constructor(private readonly partiesService: PartiesService) {}

  @Post()
  async create(@Body() data: {
    taxId: string;
    name: string;
    address?: string;
    city?: string;
    postalCode?: string;
    country?: string;
    email?: string;
    phone?: string;
    isCustomer?: boolean;
    isSupplier?: boolean;
  }) {
    return this.partiesService.create(data);
  }

  @Get()
  async findAll(@Query('type') type?: 'customer' | 'supplier') {
    return this.partiesService.findAll(type);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.partiesService.findOne(id);
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() data: any) {
    return this.partiesService.update(id, data);
  }
}
