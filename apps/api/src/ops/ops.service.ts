import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CloseValidatorService } from '@crypto-ledger/crypto/close/close-validator.service';

@Injectable()
export class OpsService {
  private validator: CloseValidatorService;

  constructor(private prisma: PrismaService) {
    this.validator = new CloseValidatorService(prisma);
  }

  async getHealth(period?: string) {
    const targetPeriod = period || new Date().toISOString().slice(0, 7);
    return this.validator.validatePeriod(targetPeriod);
  }

  async getCloseChecklist(period: string) {
    return this.prisma.closeChecklist.findUnique({
      where: { period },
    });
  }

  async getOpenIssues(period?: string) {
    return this.prisma.closeIssue.findMany({
      where: {
        period,
        status: 'open',
      },
      orderBy: [
        { severity: 'asc' }, // blockers first
        { createdAt: 'desc' },
      ],
    });
  }

  async resolveIssue(issueId: string, resolution: string, resolvedBy: string) {
    return this.prisma.closeIssue.update({
      where: { id: issueId },
      data: {
        status: 'resolved',
        resolvedAt: new Date(),
        resolvedBy,
        resolution,
      },
    });
  }

  async closePeriod(period: string, closedBy: string) {
    // Validate first
    const health = await this.validator.validatePeriod(period);

    if (!health.readyToClose) {
      throw new Error(`Period ${period} has blocking issues and cannot be closed`);
    }

    // Mark as closed
    await this.prisma.closeChecklist.update({
      where: { period },
      data: {
        status: 'closed',
        closedAt: new Date(),
        closedBy,
      },
    });

    // Create snapshot
    // (Would integrate with snapshot service from Task 0.3)

    return {
      period,
      closedAt: new Date(),
      closedBy,
    };
  }
}
