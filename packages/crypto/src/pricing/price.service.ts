import { PrismaClient } from '@prisma/client';
import { IPriceProvider } from './price-provider.interface';
import { PricePoint, PriceQuery, PriceRange } from '@crypto-ledger/shared/types/price.types';
import { CoingeckoProvider } from './providers/coingecko.provider';
import { DummyProvider } from './providers/dummy.provider';

export class PriceService {
  private providers: IPriceProvider[] = [];
  private cacheMinutes: number = 5;

  constructor(
    private prisma: PrismaClient,
    private config: {
      source?: string;
      coingeckoApiKey?: string;
      cacheDuration?: number;
    } = {}
  ) {
    this.cacheMinutes = config.cacheDuration || 5;
    this.initializeProviders();
  }

  private initializeProviders() {
    const source = this.config.source || 'coingecko';

    if (source === 'coingecko') {
      this.providers.push(new CoingeckoProvider(this.config.coingeckoApiKey));
    }

    // Always add dummy as fallback
    this.providers.push(new DummyProvider());
  }

  async getCurrentPrice(query: PriceQuery): Promise<PricePoint | null> {
    // Check cache first
    const cached = await this.getCachedPrice(query);
    if (cached) return cached;

    // Try each provider in order
    for (const provider of this.providers) {
      try {
        const price = await provider.getCurrentPrice(query);
        
        if (price) {
          await this.cachePrice(price);
          return price;
        }
      } catch (error) {
        console.error(`Provider ${provider.name} failed:`, error);
      }
    }

    return null;
  }

  async getHistoricalPrice(query: PriceQuery & { timestamp: Date }): Promise<PricePoint | null> {
    // Check database first
    const stored = await this.prisma.price.findFirst({
      where: {
        asset: query.asset.toUpperCase(),
        quote: query.quote.toUpperCase(),
        timestamp: {
          gte: new Date(query.timestamp.getTime() - 60 * 60 * 1000), // ±1 hour
          lte: new Date(query.timestamp.getTime() + 60 * 60 * 1000),
        },
      },
      orderBy: {
        timestamp: 'asc',
      },
    });

    if (stored) {
      return {
        asset: stored.asset,
        quote: stored.quote,
        timestamp: stored.timestamp,
        value: stored.value,
        source: stored.source as any,
        metadata: stored.metadata as any,
      };
    }

    // Fetch from provider
    for (const provider of this.providers) {
      try {
        const price = await provider.getHistoricalPrice(query);
        
        if (price) {
          await this.storePrice(price);
          return price;
        }
      } catch (error) {
        console.error(`Provider ${provider.name} failed:`, error);
      }
    }

    return null;
  }

  async backfillPrices(range: PriceRange): Promise<number> {
    let stored = 0;

    for (const provider of this.providers) {
      try {
        const data = await provider.getHistoricalPrices(range);
        
        if (data) {
          for (const price of data.prices) {
            await this.storePrice({
              asset: data.asset,
              quote: data.quote,
              timestamp: price.timestamp,
              value: price.value,
              source: data.source,
            });
            stored++;
          }
          
          break; // Success, don't try other providers
        }
      } catch (error) {
        console.error(`Provider ${provider.name} backfill failed:`, error);
      }
    }

    return stored;
  }

  private async getCachedPrice(query: PriceQuery): Promise<PricePoint | null> {
    const cached = await this.prisma.priceCache.findUnique({
      where: {
        asset_quote_source: {
          asset: query.asset.toUpperCase(),
          quote: query.quote.toUpperCase(),
          source: this.providers[0]?.name || 'dummy',
        },
      },
    });

    if (!cached || cached.expiresAt < new Date()) {
      return null;
    }

    return {
      asset: cached.asset,
      quote: cached.quote,
      timestamp: cached.createdAt,
      value: cached.value,
      source: cached.source as any,
    };
  }

  private async cachePrice(price: PricePoint): Promise<void> {
    const expiresAt = new Date(Date.now() + this.cacheMinutes * 60 * 1000);

    await this.prisma.priceCache.upsert({
      where: {
        asset_quote_source: {
          asset: price.asset,
          quote: price.quote,
          source: price.source,
        },
      },
      update: {
        value: price.value,
        expiresAt,
      },
      create: {
        asset: price.asset,
        quote: price.quote,
        value: price.value,
        source: price.source,
        expiresAt,
      },
    });
  }

  private async storePrice(price: PricePoint): Promise<void> {
    await this.prisma.price.upsert({
      where: {
        asset_quote_timestamp_source: {
          asset: price.asset,
          quote: price.quote,
          timestamp: price.timestamp,
          source: price.source,
        },
      },
      update: {
        value: price.value,
        metadata: price.metadata || {},
      },
      create: {
        asset: price.asset,
        quote: price.quote,
        timestamp: price.timestamp,
        value: price.value,
        source: price.source,
        metadata: price.metadata || {},
      },
    });
  }

  async getPriceAtDate(asset: string, quote: string, date: Date): Promise<number | null> {
    const price = await this.getHistoricalPrice({
      asset,
      quote,
      timestamp: date,
    });

    return price?.value || null;
  }
}
