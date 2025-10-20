import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Service for managing parties (customers and suppliers)
 */
@Injectable()
export class PartiesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a new party
   */
  async create(data: {
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
    const existing = await this.prisma.party.findUnique({
      where: { taxId: data.taxId },
    });

    if (existing) {
      throw new ConflictException(`Party with tax ID ${data.taxId} already exists`);
    }

    return this.prisma.party.create({
      data: {
        taxId: data.taxId,
        name: data.name,
        address: data.address,
        city: data.city,
        postalCode: data.postalCode,
        country: data.country || 'ES',
        email: data.email,
        phone: data.phone,
        isCustomer: data.isCustomer || false,
        isSupplier: data.isSupplier || false,
      },
    });
  }

  /**
   * Get all parties
   */
  async findAll(type?: 'customer' | 'supplier') {
    const where: any = {};

    if (type === 'customer') {
      where.isCustomer = true;
    } else if (type === 'supplier') {
      where.isSupplier = true;
    }

    return this.prisma.party.findMany({
      where,
      orderBy: { name: 'asc' },
    });
  }

  /**
   * Get party by ID
   */
  async findOne(id: string) {
    const party = await this.prisma.party.findUnique({
      where: { id },
      include: {
        issuedInvoices: {
          take: 10,
          orderBy: { invoiceDate: 'desc' },
        },
        receivedInvoices: {
          take: 10,
          orderBy: { invoiceDate: 'desc' },
        },
      },
    });

    if (!party) {
      throw new NotFoundException(`Party ${id} not found`);
    }

    return party;
  }

  /**
   * Update party
   */
  async update(id: string, data: Partial<{
    name: string;
    address: string;
    city: string;
    postalCode: string;
    country: string;
    email: string;
    phone: string;
  }>) {
    return this.prisma.party.update({
      where: { id },
      data,
    });
  }
}
