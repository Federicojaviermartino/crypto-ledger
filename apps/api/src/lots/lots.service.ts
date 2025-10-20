import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LotService } from '@crypto-ledger/crypto/lots/lot-service';

/**
 * NestJS wrapper for lot service
 */
@Injectable()
export class LotsService {
  private lotService: LotService;

  constructor(private prisma: PrismaService) {
    this.lotService = new LotService(this.prisma);
  }

  async createLot(data: any) {
    return this.lotService.createLot(data);
  }

  async disposeLots(data: any) {
    return this.lotService.disposeLots(data);
  }

  async getLotBalances(asset: string) {
    return this.lotService.getLotBalances(asset);
  }

  async getRealizedPnL(params: any) {
    return this.lotService.getRealizedPnL(params);
  }
}
