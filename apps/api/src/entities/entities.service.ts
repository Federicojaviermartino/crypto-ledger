import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Service for entity management
 */
@Injectable()
export class EntitiesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a new entity
   */
  async create(data: {
    code: string;
    name: string;
    currency: string;
    entityType: string;
    country?: string;
    taxId?: string;
    parentEntityId?: string;
  }) {
    const existing = await this.prisma.entity.findUnique({
      where: { code: data.code },
    });

    if (existing) {
      throw new ConflictException(`Entity ${data.code} already exists`);
    }

    return this.prisma.entity.create({
      data: {
        code: data.code,
        name: data.name,
        currency: data.currency,
        entityType: data.entityType,
        country: data.country,
        taxId: data.taxId,
        parentEntityId: data.parentEntityId,
        isActive: true,
      },
    });
  }

  /**
   * Get all entities
   */
  async findAll() {
    return this.prisma.entity.findMany({
      where: { isActive: true },
      include: {
        parent: true,
        children: true,
      },
      orderBy: { code: 'asc' },
    });
  }

  /**
   * Get entity by ID
   */
  async findOne(id: string) {
    const entity = await this.prisma.entity.findUnique({
      where: { id },
      include: {
        parent: true,
        children: true,
        accounts: true,
      },
    });

    if (!entity) {
      throw new NotFoundException(`Entity ${id} not found`);
    }

    return entity;
  }

  /**
   * Create intercompany relation
   */
  async createIntercompanyRelation(data: {
    fromEntityId: string;
    toEntityId: string;
    relationType: string;
    receivableAccountId?: string;
    payableAccountId?: string;
  }) {
    return this.prisma.intercompanyRelation.create({
      data: {
        fromEntityId: data.fromEntityId,
        toEntityId: data.toEntityId,
        relationType: data.relationType,
        receivableAccountId: data.receivableAccountId,
        payableAccountId: data.payableAccountId,
        isActive: true,
      },
    });
  }

  /**
   * Get intercompany relations
   */
  async getIntercompanyRelations() {
    return this.prisma.intercompanyRelation.findMany({
      where: { isActive: true },
      include: {
        fromEntity: true,
        toEntity: true,
      },
    });
  }
}
