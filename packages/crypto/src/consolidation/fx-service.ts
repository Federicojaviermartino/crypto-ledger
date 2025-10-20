import { PrismaClient } from '@prisma/client';
import axios from 'axios';

/**
 * Foreign Exchange service
 * Handles currency translation for consolidation
 */
export class FxService {
  constructor(private prisma: PrismaClient) {}

  /**
   * Get exchange rate for a specific date
   */
  async getRate(fromCurrency: string, toCurrency: string, date: Date): Promise<number> {
    if (fromCurrency === toCurrency) {
      return 1.0;
    }

    // Check database first
    const stored = await this.prisma.exchangeRate.findUnique({
      where: {
        fromCurrency_toCurrency_date: {
          fromCurrency,
          toCurrency,
          date,
        },
      },
    });

    if (stored) {
      return stored.rate;
    }

    // Fetch from external source (ECB)
    const rate = await this.fetchRateFromECB(fromCurrency, toCurrency, date);

    // Store for future use
    await this.prisma.exchangeRate.create({
      data: {
        fromCurrency,
        toCurrency,
        date,
        rate,
        source: 'ecb',
      },
    });

    return rate;
  }

  /**
   * Translate amount from one currency to another
   */
  async translateAmount(
    amount: number,
    fromCurrency: string,
    toCurrency: string,
    date: Date,
  ): Promise<number> {
    const rate = await this.getRate(fromCurrency, toCurrency, date);
    return amount * rate;
  }

  /**
   * Fetch rate from European Central Bank
   */
  private async fetchRateFromECB(
    fromCurrency: string,
    toCurrency: string,
    date: Date,
  ): Promise<number> {
    try {
      // ECB provides rates against EUR
      const dateStr = date.toISOString().split('T')[0];

      // If converting from EUR
      if (fromCurrency === 'EUR') {
        const url = `https://api.frankfurter.app/${dateStr}?from=EUR&to=${toCurrency}`;
        const response = await axios.get(url);
        return response.data.rates[toCurrency];
      }

      // If converting to EUR
      if (toCurrency === 'EUR') {
        const url = `https://api.frankfurter.app/${dateStr}?from=${fromCurrency}&to=EUR`;
        const response = await axios.get(url);
        return response.data.rates.EUR;
      }

      // Cross rate through EUR
      const [fromToEur, eurToTo] = await Promise.all([
        this.getRate(fromCurrency, 'EUR', date),
        this.getRate('EUR', toCurrency, date),
      ]);

      return fromToEur * eurToTo;
    } catch (error) {
      console.error(`Error fetching FX rate for ${fromCurrency}/${toCurrency}:`, error);
      throw new Error(`Failed to fetch FX rate`);
    }
  }

  /**
   * Store manual exchange rate
   */
  async storeRate(data: {
    fromCurrency: string;
    toCurrency: string;
    date: Date;
    rate: number;
  }): Promise<void> {
    await this.prisma.exchangeRate.upsert({
      where: {
        fromCurrency_toCurrency_date: {
          fromCurrency: data.fromCurrency,
          toCurrency: data.toCurrency,
          date: data.date,
        },
      },
      update: {
        rate: data.rate,
        source: 'manual',
      },
      create: {
        fromCurrency: data.fromCurrency,
        toCurrency: data.toCurrency,
        date: data.date,
        rate: data.rate,
        source: 'manual',
      },
    });
  }
}
