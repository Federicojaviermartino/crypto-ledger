import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Service for managing chart of accounts
 */
@Injectable()
export class AccountsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a new account
   */
  async create(data: {
    code: string;
    name: string;
    type: string;
    parentId?: string;
  }) {
    const existing = await this.prisma.account.findUnique({
      where: { code: data.code },
    });

    if (existing) {
      throw new ConflictException(`Account code ${data.code} already exists`);
    }

    return this.prisma.account.create({
      data: {
        code: data.code,
        name: data.name,
        type: data.type,
        parentId: data.parentId,
        isActive: true,
      },
    });
  }

  /**
   * Get all accounts
   */
  async findAll() {
    return this.prisma.account.findMany({
      where: { isActive: true },
      orderBy: { code: 'asc' },
      include: {
        parent: true,
      },
    });
  }

  /**
   * Get account by code
   */
  async findByCode(code: string) {
    const account = await this.prisma.account.findUnique({
      where: { code },
      include: {
        parent: true,
        children: true,
      },
    });

    if (!account) {
      throw new NotFoundException(`Account ${code} not found`);
    }

    return account;
  }
}
