import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConsolidationEngine } from '@crypto-ledger/crypto/consolidation/consolidation-engine';
import { FxService } from '@crypto-ledger/crypto/consolidation/fx-service';

/**
 * Service for consolidation operations
 */
@Injectable()
export class ConsolidationService {
  private engine: ConsolidationEngine;
  private fxService: FxService;

  constructor(private prisma: PrismaService) {
    this.engine = new ConsolidationEngine(this.prisma);
    this.fxService = new FxService(this.prisma);
  }

  async runConsolidation(period: string, reportingCurrency: string, asOfDate: Date) {
    return this.engine.runConsolidation({ period, reportingCurrency, asOfDate });
  }

  async getConsolidation(period: string, reportingCurrency: string) {
    return this.engine.getConsolidation(period, reportingCurrency);
  }

  async storeExchangeRate(data: {
    fromCurrency: string;
    toCurrency: string;
    date: Date;
    rate: number;
  }) {
    return this.fxService.storeRate(data);
  }

  async getExchangeRate(fromCurrency: string, toCurrency: string, date: Date) {
    return this.fxService.getRate(fromCurrency, toCurrency, date);
  }
}
