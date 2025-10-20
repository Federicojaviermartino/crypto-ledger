import { Controller, Get, Post, Body, Param } from '@nestjs/common';
import { EntitiesService } from './entities.service';

/**
 * Controller for entity operations
 */
@Controller('entities')
export class EntitiesController {
  constructor(private readonly entitiesService: EntitiesService) {}

  @Post()
  async create(@Body() data: {
    code: string;
    name: string;
    currency: string;
    entityType: string;
    country?: string;
    taxId?: string;
    parentEntityId?: string;
  }) {
    return this.entitiesService.create(data);
  }

  @Get()
  async findAll() {
    return this.entitiesService.findAll();
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.entitiesService.findOne(id);
  }

  @Post('intercompany')
  async createIntercompany(@Body() data: {
    fromEntityId: string;
    toEntityId: string;
    relationType: string;
    receivableAccountId?: string;
    payableAccountId?: string;
  }) {
    return this.entitiesService.createIntercompanyRelation(data);
  }

  @Get('intercompany/relations')
  async getIntercompanyRelations() {
    return this.entitiesService.getIntercompanyRelations();
  }
}
