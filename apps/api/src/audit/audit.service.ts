import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuditService {
  constructor(private prisma: PrismaService) {}

  async getAuditLogs(params: {
    userId?: string;
    action?: string;
    resource?: string;
    resourceId?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
  }) {
    const {
      userId,
      action,
      resource,
      resourceId,
      startDate,
      endDate,
      limit = 100,
      offset = 0,
    } = params;

    const where: any = {};

    if (userId) where.userId = userId;
    if (action) where.action = { contains: action };
    if (resource) where.resource = resource;
    if (resourceId) where.resourceId = resourceId;

    if (startDate || endDate) {
      where.timestamp = {};
      if (startDate) where.timestamp.gte = startDate;
      if (endDate) where.timestamp.lte = endDate;
    }

    const [logs, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
            },
          },
        },
        orderBy: { timestamp: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      logs,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + logs.length < total,
      },
    };
  }

  async getEntryAuditTrail(entryId: string) {
    return this.prisma.auditLog.findMany({
      where: {
        resourceId: entryId,
      },
      include: {
        user: {
          select: {
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
      orderBy: { timestamp: 'asc' },
    });
  }

  async getEntryDetailedView(entryId: string) {
    const entry = await this.prisma.journalEntry.findUnique({
      where: { id: entryId },
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
        blockchainEvents: true,
        invoices: true,
        sourceLots: true,
        lotDisposals: true,
      },
    });

    if (!entry) return null;

    // Calculate balances
    const totalDebit = entry.postings.reduce((sum, p) => sum + p.debit, 0);
    const totalCredit = entry.postings.reduce((sum, p) => sum + p.credit, 0);

    // Group by dimensions
    const dimensionalBreakdown = this.groupPostingsByDimensions(entry.postings);

    // Get hash chain proof
    const proof = await this.getHashChainProof(entryId);

    return {
      entry: {
        id: entry.id,
        date: entry.date,
        description: entry.description,
        reference: entry.reference,
        hash: entry.hash,
        prevHash: entry.prevHash,
        metadata: entry.metadata,
        createdAt: entry.createdAt,
      },
      postings: entry.postings.map(p => ({
        id: p.id,
        account: {
          code: p.account.code,
          name: p.account.name,
          type: p.account.type,
        },
        debit: p.debit,
        credit: p.credit,
        description: p.description,
        dimensions: p.dimensions.map(d => ({
          dimension: d.dimensionValue.dimension.code,
          dimensionName: d.dimensionValue.dimension.name,
          value: d.dimensionValue.code,
          valueName: d.dimensionValue.name,
        })),
      })),
      summary: {
        totalDebit,
        totalCredit,
        isBalanced: Math.abs(totalDebit - totalCredit) < 0.01,
        postingCount: entry.postings.length,
      },
      dimensionalBreakdown,
      relatedData: {
        blockchainEvents: entry.blockchainEvents.length,
        invoices: entry.invoices.length,
        lots: entry.sourceLots.length,
        disposals: entry.lotDisposals.length,
      },
      hashChainProof: proof,
    };
  }

  private groupPostingsByDimensions(postings: any[]) {
    const dimensionMap = new Map<string, Map<string, number>>();

    for (const posting of postings) {
      const balance = posting.debit - posting.credit;

      for (const pd of posting.dimensions) {
        const dimCode = pd.dimensionValue.dimension.code;
        const valueCode = pd.dimensionValue.code;

        if (!dimensionMap.has(dimCode)) {
          dimensionMap.set(dimCode, new Map());
        }

        const valueMap = dimensionMap.get(dimCode)!;
        const current = valueMap.get(valueCode) || 0;
        valueMap.set(valueCode, current + balance);
      }
    }

    const breakdown: any[] = [];

    for (const [dimension, values] of dimensionMap.entries()) {
      breakdown.push({
        dimension,
        values: Array.from(values.entries()).map(([value, balance]) => ({
          value,
          balance,
        })),
      });
    }

    return breakdown;
  }

  private async getHashChainProof(entryId: string) {
    const entry = await this.prisma.journalEntry.findUnique({
      where: { id: entryId },
      select: { hash: true, prevHash: true, createdAt: true },
    });

    if (!entry) return null;

    // Get previous entry
    const prevEntry = await this.prisma.journalEntry.findFirst({
      where: {
        createdAt: { lt: entry.createdAt },
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true, hash: true },
    });

    // Get next entry
    const nextEntry = await this.prisma.journalEntry.findFirst({
      where: {
        createdAt: { gt: entry.createdAt },
      },
      orderBy: { createdAt: 'asc' },
      select: { id: true, hash: true, prevHash: true },
    });

    return {
      currentHash: entry.hash,
      prevHash: entry.prevHash,
      prevEntryId: prevEntry?.id,
      prevEntryHashMatches: prevEntry?.hash === entry.prevHash,
      nextEntryId: nextEntry?.id,
      nextEntryPrevHashMatches: nextEntry?.prevHash === entry.hash,
      chainIntact: (
        (prevEntry ? prevEntry.hash === entry.prevHash : true) &&
        (nextEntry ? nextEntry.prevHash === entry.hash : true)
      ),
    };
  }

  async getAuditStats(params: {
    startDate?: Date;
    endDate?: Date;
  }) {
    const { startDate, endDate } = params;

    const where: any = {};
    if (startDate || endDate) {
      where.timestamp = {};
      if (startDate) where.timestamp.gte = startDate;
      if (endDate) where.timestamp.lte = endDate;
    }

    const [
      totalLogs,
      actionCounts,
      userActivity,
      recentActivity,
    ] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      
      this.prisma.auditLog.groupBy({
        by: ['action'],
        where,
        _count: true,
        orderBy: { _count: { action: 'desc' } },
        take: 10,
      }),

      this.prisma.auditLog.groupBy({
        by: ['userId'],
        where,
        _count: true,
        orderBy: { _count: { userId: 'desc' } },
        take: 10,
      }),

      this.prisma.auditLog.findMany({
        where,
        include: {
          user: {
            select: { email: true },
          },
        },
        orderBy: { timestamp: 'desc' },
        take: 20,
      }),
    ]);

    return {
      totalLogs,
      topActions: actionCounts.map(a => ({
        action: a.action,
        count: a._count,
      })),
      topUsers: await Promise.all(
        userActivity.map(async u => {
          const user = u.userId ? await this.prisma.user.findUnique({
            where: { id: u.userId },
            select: { email: true },
          }) : null;

          return {
            userId: u.userId,
            email: user?.email || 'Anonymous',
            count: u._count,
          };
        })
      ),
      recentActivity: recentActivity.map(log => ({
        action: log.action,
        resource: log.resource,
        user: log.user?.email || 'Anonymous',
        timestamp: log.timestamp,
      })),
    };
  }
}
