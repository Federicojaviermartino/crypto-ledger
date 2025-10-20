
import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../services/prisma.service';
import { AuditService } from '../../services/audit.service';
import { CreateEntryDto } from '@ledger/shared';

@Injectable()
export class LedgerService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  async createEntry(dto: CreateEntryDto, userId: string) {
    // quick validation: only one of debit/credit > 0 per posting
    for (const p of dto.postings) {
      const debit = p.debit ?? 0;
      const credit = p.credit ?? 0;
      if (debit > 0 && credit > 0) {
        throw new BadRequestException('Posting with both debit and credit > 0');
      }
      if (debit < 0 || credit < 0) {
        throw new BadRequestException('Negative numbers are not allowed');
      }
    }

    const sumDebit = Number(dto.postings.reduce((a, p) => a + (p.debit ?? 0), 0).toFixed(2));
    const sumCredit = Number(dto.postings.reduce((a, p) => a + (p.credit ?? 0), 0).toFixed(2));
    if (sumDebit !== sumCredit) {
      throw new BadRequestException('Entry not balanced');
    }

    const entry = await this.prisma.$transaction(async (tx) => {
      const created = await tx.journalEntry.create({
        data: {
          date: new Date(dto.date),
          memo: dto.memo,
          createdBy: userId,
          postings: {
            create: dto.postings.map((p) => ({
              accountId: p.accountId,
              debit: p.debit ?? 0,
              credit: p.credit ?? 0,
              assetId: p.assetId,
              quantity: p.quantity,
              price: p.price,
              fxRate: p.fxRate,
              lotId: p.lotId,
            })),
          },
        },
        include: { postings: true },
      });
      await this.audit.log('JournalEntry', created.id, 'CREATE', userId);
      return created;
    });

    return entry;
  }
}
