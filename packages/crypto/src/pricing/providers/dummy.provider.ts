import { IPriceProvider } from '../price-provider.interface';
import { PricePoint, PriceQuery, PriceRange, HistoricalPriceData } from '@crypto-ledger/shared/types/price.types';

export class DummyProvider implements IPriceProvider {
  name = 'dummy';
  
  private dummyPrices: Record<string, number> = {
    'BTC': 45000,
    'ETH': 2500,
    'USDC': 1,
    'USDT': 1,
    'DAI': 1,
  };

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async getCurrentPrice(query: PriceQuery): Promise<PricePoint | null> {
    const price = this.dummyPrices[query.asset.toUpperCase()];
    if (!price) return null;

    // Add small random variation (±2%)
    const variation = 0.98 + Math.random() * 0.04;
    
    return {
      asset: query.asset.toUpperCase(),
      quote: query.quote.toUpperCase(),
      timestamp: new Date(),
      value: price * variation,
      source: 'dummy',
      metadata: {
        note: 'Dummy data for testing',
      },
    };
  }

  async getHistoricalPrice(query: PriceQuery & { timestamp: Date }): Promise<PricePoint | null> {
    const price = this.dummyPrices[query.asset.toUpperCase()];
    if (!price) return null;

    // Simulate historical price with time-based variation
    const daysSince = Math.floor((Date.now() - query.timestamp.getTime()) / (1000 * 60 * 60 * 24));
    const historicalFactor = 1 - (daysSince * 0.001); // Slight decrease over time

    return {
      asset: query.asset.toUpperCase(),
      quote: query.quote.toUpperCase(),
      timestamp: query.timestamp,
      value: price * historicalFactor,
      source: 'dummy',
      metadata: {
        note: 'Dummy historical data',
        daysSince,
      },
    };
  }

  async getHistoricalPrices(range: PriceRange): Promise<HistoricalPriceData | null> {
    const basePrice = this.dummyPrices[range.asset.toUpperCase()];
    if (!basePrice) return null;

    const prices = [];
    const current = new Date(range.from);
    const dayMs = 24 * 60 * 60 * 1000;

    while (current <= range.to) {
      const daysSince = Math.floor((Date.now() - current.getTime()) / dayMs);
      const historicalFactor = 1 - (daysSince * 0.001);
      
      prices.push({
        timestamp: new Date(current),
        value: basePrice * historicalFactor,
      });

      current.setTime(current.getTime() + dayMs);
    }

    return {
      asset: range.asset.toUpperCase(),
      quote: range.quote.toUpperCase(),
      prices,
      source: 'dummy',
    };
  }
}
