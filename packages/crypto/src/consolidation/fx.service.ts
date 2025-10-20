import { PrismaClient } from '@prisma/client';
import axios from 'axios';

export class FxService {
  constructor(private prisma: PrismaClient) {}

  async getRate(from: string, to: string, date: Date): Promise<number> {
    if (from === to) return 1.0;

    // Check database cache
    const cached = await this.prisma.exchangeRate.findFirst({
      where: {
        fromCurrency: from.toUpperCase(),
        toCurrency: to.toUpperCase(),
        date: {
          gte: new Date(date.setHours(0, 0, 0, 0)),
          lt: new Date(date.setHours(23, 59, 59, 999)),
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (cached) return cached.rate;

    // Fetch from ECB (fallback to manual)
    const rate = await this.fetchRateFromECB(from, to, date);
    
    if (rate) {
      await this.storeRate(from, to, date, rate, 'ecb');
      return rate;
    }

    // Use dummy rate (for development)
    const dummyRate = this.getDummyRate(from, to);
    await this.storeRate(from, to, date, dummyRate, 'dummy');
    return dummyRate;
  }

  private async fetchRateFromECB(from: string, to: string, date: Date): Promise<number | null> {
    try {
      // ECB API only provides EUR-based rates
      if (from !== 'EUR' && to !== 'EUR') {
        // Convert via EUR: from -> EUR -> to
        const fromToEur = await this.fetchRateFromECB(from, 'EUR', date);
        const eurToTo = await this.fetchRateFromECB('EUR', to, date);
        
        if (fromToEur && eurToTo) {
          return fromToEur * eurToTo;
        }
        return null;
      }

      const dateStr = date.toISOString().split('T')[0];
      const response = await axios.get(
        `https://api.exchangerate.host/${dateStr}?base=${from}&symbols=${to}`,
        { timeout: 5000 }
      );

      return response.data.rates?.[to] || null;
    } catch (error) {
      console.error('ECB API error:', error);
      return null;
    }
  }

  private getDummyRate(from: string, to: string): number {
    const rates: Record<string, number> = {
      'USD_EUR': 0.92,
      'EUR_USD': 1.09,
      'USD_GBP': 0.79,
      'GBP_USD': 1.27,
      'EUR_GBP': 0.86,
      'GBP_EUR': 1.16,
    };

    const key = `${from}_${to}`;
    return rates[key] || 1.0;
  }

  private async storeRate(from: string, to: string, date: Date, rate: number, source: string) {
    await this.prisma.exchangeRate.create({
      data: {
        fromCurrency: from.toUpperCase(),
        toCurrency: to.toUpperCase(),
        date,
        rate,
        source,
      },
    });
  }

  async translate(amount: number, from: string, to: string, date: Date) {
    const rate = await this.getRate(from, to, date);
    
    return {
      originalAmount: amount,
      originalCurrency: from,
      translatedAmount: amount * rate,
      targetCurrency: to,
      rate,
      translationDate: date,
    };
  }
}
