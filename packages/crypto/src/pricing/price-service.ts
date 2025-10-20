import axios from 'axios';
import { PrismaClient } from '@prisma/client';

/**
 * Price service for fetching and caching asset prices
 * Supports Coingecko API
 */
export class PriceService {
  private prisma: PrismaClient;
  private coingeckoApiKey?: string;
  private cache: Map<string, { value: number; timestamp: Date }>;

  constructor(prisma: PrismaClient, apiKey?: string) {
    this.prisma = prisma;
    this.coingeckoApiKey = apiKey;
    this.cache = new Map();
  }

  /**
   * Get current price for asset
   */
  async getCurrentPrice(asset: string, quote: string = 'USD'): Promise<number> {
    // Check cache (5 minute TTL)
    const cacheKey = `${asset}:${quote}`;
    const cached = this.cache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp.getTime() < 5 * 60 * 1000) {
      return cached.value;
    }

    // Fetch from Coingecko
    const price = await this.fetchFromCoingecko(asset, quote);

    // Cache result
    this.cache.set(cacheKey, { value: price, timestamp: new Date() });

    // Store in database
    await this.prisma.price.create({
      data: {
        asset,
        quote,
        timestamp: new Date(),
        value: price,
        source: 'coingecko',
      },
    });

    return price;
  }

  /**
   * Get historical price for specific date
   */
  async getHistoricalPrice(
    asset: string,
    quote: string,
    date: Date,
  ): Promise<number> {
    // Check database first
    const stored = await this.prisma.price.findFirst({
      where: {
        asset,
        quote,
        timestamp: {
          gte: new Date(date.getTime() - 60 * 60 * 1000), // 1 hour window
          lte: new Date(date.getTime() + 60 * 60 * 1000),
        },
      },
      orderBy: { timestamp: 'asc' },
    });

    if (stored) {
      return stored.value;
    }

    // Fetch from Coingecko history API
    const price = await this.fetchHistoricalFromCoingecko(asset, quote, date);

    // Store in database
    await this.prisma.price.create({
      data: {
        asset,
        quote,
        timestamp: date,
        value: price,
        source: 'coingecko',
      },
    });

    return price;
  }

  /**
   * Fetch current price from Coingecko
   */
  private async fetchFromCoingecko(asset: string, quote: string): Promise<number> {
    const coinId = this.mapAssetToCoinId(asset);
    const vs_currency = quote.toLowerCase();

    const url = 'https://api.coingecko.com/api/v3/simple/price';
    const params = {
      ids: coinId,
      vs_currencies: vs_currency,
      x_cg_demo_api_key: this.coingeckoApiKey,
    };

    try {
      const response = await axios.get(url, { params });
      return response.data[coinId][vs_currency];
    } catch (error) {
      console.error(`Error fetching price for ${asset}:`, error);
      throw new Error(`Failed to fetch price for ${asset}`);
    }
  }

  /**
   * Fetch historical price from Coingecko
   */
  private async fetchHistoricalFromCoingecko(
    asset: string,
    quote: string,
    date: Date,
  ): Promise<number> {
    const coinId = this.mapAssetToCoinId(asset);
    const dateStr = date.toISOString().split('T')[0].split('-').reverse().join('-'); // DD-MM-YYYY

    const url = `https://api.coingecko.com/api/v3/coins/${coinId}/history`;
    const params = {
      date: dateStr,
      localization: false,
      x_cg_demo_api_key: this.coingeckoApiKey,
    };

    try {
      const response = await axios.get(url, { params });
      const vs_currency = quote.toLowerCase();
      return response.data.market_data.current_price[vs_currency];
    } catch (error) {
      console.error(`Error fetching historical price for ${asset}:`, error);
      throw new Error(`Failed to fetch historical price for ${asset}`);
    }
  }

  /**
   * Map asset symbol to Coingecko coin ID
   */
  private mapAssetToCoinId(asset: string): string {
    const mapping: Record<string, string> = {
      BTC: 'bitcoin',
      ETH: 'ethereum',
      USDC: 'usd-coin',
      USDT: 'tether',
      DAI: 'dai',
      WETH: 'weth',
    };

    return mapping[asset.toUpperCase()] || asset.toLowerCase();
  }

  /**
   * Backfill historical prices for date range
   */
  async backfillPrices(
    asset: string,
    quote: string,
    startDate: Date,
    endDate: Date,
  ): Promise<number> {
    let filled = 0;
    const current = new Date(startDate);

    while (current <= endDate) {
      try {
        await this.getHistoricalPrice(asset, quote, new Date(current));
        filled++;
      } catch (error) {
        console.error(`Error backfilling price for ${current}:`, error);
      }

      current.setDate(current.getDate() + 1);
    }

    return filled;
  }
}
