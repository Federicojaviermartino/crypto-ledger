import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PriceService } from '@crypto-ledger/crypto/pricing/price-service';

/**
 * NestJS wrapper for price service
 */
@Injectable()
export class PricingService {
  private priceService: PriceService;

  constructor(private prisma: PrismaService) {
    this.priceService = new PriceService(
      this.prisma,
      process.env.COINGECKO_API_KEY,
    );
  }

  async getCurrentPrice(asset: string, quote: string) {
    return this.priceService.getCurrentPrice(asset, quote);
  }

  async getHistoricalPrice(asset: string, quote: string, date: Date) {
    return this.priceService.getHistoricalPrice(asset, quote, date);
  }

  async backfillPrices(
    asset: string,
    quote: string,
    startDate: Date,
    endDate: Date,
  ) {
    return this.priceService.backfillPrices(asset, quote, startDate, endDate);
  }
}
