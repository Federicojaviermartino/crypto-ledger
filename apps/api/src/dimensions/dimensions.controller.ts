import { Controller, Get, Post, Body, Param } from '@nestjs/common';
import { DimensionsService } from './dimensions.service';

/**
 * Controller for dimension management
 */
@Controller('dimensions')
export class DimensionsController {
  constructor(private readonly dimensionsService: DimensionsService) {}

  @Post()
  async createDimension(@Body() data: {
    code: string;
    name: string;
    description?: string;
  }) {
    return this.dimensionsService.createDimension(data);
  }

  @Post(':code/values')
  async createValue(
    @Param('code') code: string,
    @Body() data: {
      code: string;
      name: string;
      description?: string;
    },
  ) {
    return this.dimensionsService.createValue(code, data);
  }

  @Get()
  async findAll() {
    return this.dimensionsService.findAll();
  }

  @Get(':code')
  async findByCode(@Param('code') code: string) {
    return this.dimensionsService.findByCode(code);
  }
}
