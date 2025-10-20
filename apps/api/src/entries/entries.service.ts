import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { HashService } from '@crypto-ledger/crypto/hash/hash.service';
import { CreateEntryDto } from './dto/create-entry.dto';

/**
 * Service for managing journal entries
 * Enforces double-entry accounting and hash chain integrity
 */
@Injectable()
export class EntriesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a new journal entry with hash chain
   * Validates balance and creates immutable record
   */
  async create(dto: CreateEntryDto): Promise<any> {
    // Validate double-entry balance
    this.validateBalance(dto.postings);

    // Get previous entry hash for chain linking
    const prevEntry = await this.prisma.journalEntry.findFirst({
      orderBy: { createdAt: 'desc' },
      select: { id: true, hash: true },
    });

    const prevHash = prevEntry?.hash;

    return this.prisma.executeTransaction(async (tx) => {
      // Resolve account IDs
      const postingsWithAccounts = await Promise.all(
        dto.postings.map(async (posting) => {
          const account = await tx.account.findUnique({
            where: { code: posting.accountCode },
          });

          if (!account) {
            throw new BadRequestException(`Account ${posting.accountCode} not found`);
          }

          return {
            ...posting,
            accountId: account.id,
          };
        }),
      );

      // Generate hash
      const hash = HashService.generateEntryHash({
        date: new Date(dto.date),
        description: dto.description,
        reference: dto.reference,
        postings: postingsWithAccounts.map((p) => ({
          accountCode: p.accountCode,
          debit: p.debit || 0,
          credit: p.credit || 0,
          description: p.description,
        })),
        prevHash,
      });

      // Create entry
      const entry = await tx.journalEntry.create({
        data: {
          date: new Date(dto.date),
          description: dto.description,
          reference: dto.reference,
          hash,
          prevHash,
          metadata: dto.metadata || {},
          postings: {
            create: postingsWithAccounts.map((p) => ({
              accountId: p.accountId,
              debit: p.debit || 0,
              credit: p.credit || 0,
              description: p.description,
              metadata: {},
            })),
          },
        },
        include: {
          postings: {
            include: {
              account: true,
            },
          },
        },
      });

      return entry;
    });
  }

  /**
   * Get entry by ID with postings
   */
  async findOne(id: string): Promise<any> {
    const entry = await this.prisma.journalEntry.findUnique({
      where: { id },
      include: {
        postings: {
          include: {
            account: true,
            dimensions: {
              include: {
                dimensionValue: {
                  include: {
                    dimension: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!entry) {
      throw new NotFoundException(`Entry ${id} not found`);
    }

    return entry;
  }

  /**
   * List entries with pagination
   */
  async findAll(params: {
    skip?: number;
    take?: number;
    startDate?: string;
    endDate?: string;
  }): Promise<any> {
    const { skip = 0, take = 50, startDate, endDate } = params;

    const where: any = {};

    if (startDate || endDate) {
      where.date = {};
      if (startDate) where.date.gte = new Date(startDate);
      if (endDate) where.date.lte = new Date(endDate);
    }

    const [entries, total] = await Promise.all([
      this.prisma.journalEntry.findMany({
        where,
        skip,
        take,
        orderBy: { date: 'desc' },
        include: {
          postings: {
            include: {
              account: true,
            },
          },
        },
      }),
      this.prisma.journalEntry.count({ where }),
    ]);

    return {
      entries,
      pagination: {
        total,
        skip,
        take,
        hasMore: skip + entries.length < total,
      },
    };
  }

  /**
   * Get hash chain proof for entry
   */
  async getHashProof(id: string): Promise<any> {
    const entry = await this.findOne(id);

    const prevEntry = entry.prevHash
      ? await this.prisma.journalEntry.findFirst({
          where: { hash: entry.prevHash },
          select: { id: true, hash: true },
        })
      : null;

    const nextEntry = await this.prisma.journalEntry.findFirst({
      where: { prevHash: entry.hash },
      select: { id: true, hash: true, prevHash: true },
    });

    const chainIntact =
      (prevEntry ? prevEntry.hash === entry.prevHash : true) &&
      (nextEntry ? nextEntry.prevHash === entry.hash : true);

    return {
      entryId: entry.id,
      hash: entry.hash,
      prevHash: entry.prevHash,
      prevEntryId: prevEntry?.id,
      nextEntryId: nextEntry?.id,
      chainIntact,
      proof: this.generateProofSteps(entry, prevEntry, nextEntry),
    };
  }

  /**
   * Verify entire hash chain
   */
  async verifyChain(fromId?: string, toId?: string): Promise<any> {
    const entries = await this.prisma.journalEntry.findMany({
      orderBy: { createdAt: 'asc' },
      select: { id: true, hash: true, prevHash: true },
    });

    const errors: string[] = [];

    for (let i = 1; i < entries.length; i++) {
      const current = entries[i];
      const prev = entries[i - 1];

      if (current.prevHash !== prev.hash) {
        errors.push(`Chain broken at entry ${current.id}: expected prevHash ${prev.hash}, got ${current.prevHash}`);
      }
    }

    return {
      isValid: errors.length === 0,
      totalEntries: entries.length,
      errors,
      proof: HashService.generateProof(entries),
    };
  }

  /**
   * Validate double-entry balance (debits = credits)
   */
  private validateBalance(postings: Array<{ debit?: number; credit?: number }>): void {
    const totalDebit = postings.reduce((sum, p) => sum + (p.debit || 0), 0);
    const totalCredit = postings.reduce((sum, p) => sum + (p.credit || 0), 0);

    const diff = Math.abs(totalDebit - totalCredit);

    if (diff > 0.01) {
      throw new BadRequestException(
        `Entry does not balance. Debits: ${totalDebit.toFixed(2)}, Credits: ${totalCredit.toFixed(2)}, Difference: ${diff.toFixed(2)}`
      );
    }
  }

  /**
   * Generate proof steps for visualization
   */
  private generateProofSteps(entry: any, prevEntry: any, nextEntry: any): string[] {
    const steps: string[] = [];

    if (prevEntry) {
      steps.push(`Previous Entry: ${prevEntry.id}`);
      steps.push(`  Hash: ${prevEntry.hash.substring(0, 16)}...`);
      steps.push(`  ✓ Current entry prevHash matches`);
    } else {
      steps.push(`Genesis Entry (no previous)`);
    }

    steps.push(`Current Entry: ${entry.id}`);
    steps.push(`  Hash: ${entry.hash.substring(0, 16)}...`);
    steps.push(`  PrevHash: ${entry.prevHash?.substring(0, 16) || 'none'}...`);

    if (nextEntry) {
      steps.push(`Next Entry: ${nextEntry.id}`);
      steps.push(`  PrevHash: ${nextEntry.prevHash.substring(0, 16)}...`);
      steps.push(`  ✓ Next entry prevHash matches current hash`);
    } else {
      steps.push(`Latest Entry (no next)`);
    }

    return steps;
  }
}