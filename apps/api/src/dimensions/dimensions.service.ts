import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Service for managing dimensions and their values
 * Supports 7 first-class dimensions: legal_entity, cost_center, project, product, wallet, geography, custom_kv
 */
@Injectable()
export class DimensionsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a new dimension
   */
  async createDimension(data: {
    code: string;
    name: string;
    description?: string;
  }) {
    const existing = await this.prisma.dimension.findUnique({
      where: { code: data.code },
    });

    if (existing) {
      throw new ConflictException(`Dimension ${data.code} already exists`);
    }

    return this.prisma.dimension.create({
      data: {
        code: data.code,
        name: data.name,
        description: data.description,
        isActive: true,
      },
    });
  }

  /**
   * Create dimension value
   */
  async createValue(
    dimensionCode: string,
    data: {
      code: string;
      name: string;
      description?: string;
    }
  ) {
    const dimension = await this.prisma.dimension.findUnique({
      where: { code: dimensionCode },
    });

    if (!dimension) {
      throw new NotFoundException(`Dimension ${dimensionCode} not found`);
    }

    const existing = await this.prisma.dimensionValue.findFirst({
      where: {
        dimensionId: dimension.id,
        code: data.code,
      },
    });

    if (existing) {
      throw new ConflictException(
        `Value ${data.code} already exists for dimension ${dimensionCode}`
      );
    }

    return this.prisma.dimensionValue.create({
      data: {
        dimensionId: dimension.id,
        code: data.code,
        name: data.name,
        description: data.description,
        isActive: true,
      },
    });
  }

  /**
   * Get all dimensions with their values
   */
  async findAll() {
    return this.prisma.dimension.findMany({
      where: { isActive: true },
      include: {
        values: {
          where: { isActive: true },
          orderBy: { code: 'asc' },
        },
      },
      orderBy: { code: 'asc' },
    });
  }

  /**
   * Get dimension by code with values
   */
  async findByCode(code: string) {
    const dimension = await this.prisma.dimension.findUnique({
      where: { code },
      include: {
        values: {
          where: { isActive: true },
          orderBy: { code: 'asc' },
        },
      },
    });

    if (!dimension) {
      throw new NotFoundException(`Dimension ${code} not found`);
    }

    return dimension;
  }
}
