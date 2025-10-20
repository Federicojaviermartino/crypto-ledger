
import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Injectable()
export class AuditService {
  constructor(private prisma: PrismaService) {}

  async log(entity: string, entityId: string, action: string, actor: string) {
    await this.prisma.auditLog.create({
      data: { entity, entityId, action, actor, hashChain: '' },
    });
  }
}
