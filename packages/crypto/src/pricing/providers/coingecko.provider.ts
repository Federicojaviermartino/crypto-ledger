import axios, { AxiosInstance } from 'axios';
import { IPriceProvider } from '../price-provider.interface';
import { PricePoint, PriceQuery, PriceRange, HistoricalPriceData } from '@crypto-ledger/shared/types/price.types';

export class CoingeckoProvider implements IPriceProvider {
  name = 'coingecko';
  private client: AxiosInstance;
  private assetIdMap: Record<string, string> = {
    'BTC': 'bitcoin',
    'ETH': 'ethereum',
    'USDC': 'usd-coin',
    'USDT': 'tether',
    'DAI': 'dai',
  };

  constructor(
    private apiKey?: string,
    private baseUrl: string = 'https://api.coingecko.com/api/v3'
  ) {
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 10000,
      headers: apiKey ? { 'x-cg-pro-api-key': apiKey } : {},
    });

    // Add exponential backoff interceptor
    this.client.interceptors.response.use(
      response => response,
      async error => {
        const config = error.config;
        
        if (!config || !config.retry) {
          config.retry = 0;
        }

        if (error.response?.status === 429 && config.retry < 3) {
          config.retry += 1;
          const delay = Math.pow(2, config.retry) * 1000; // 2s, 4s, 8s
          
          await new Promise(resolve => setTimeout(resolve, delay));
          return this.client(config);
        }

        return Promise.reject(error);
      }
    );
  }

  async isAvailable(): Promise<boolean> {
    try {
      await this.client.get('/ping');
      return true;
    } catch {
      return false;
    }
  }

  async getCurrentPrice(query: PriceQuery): Promise<PricePoint | null> {
    const coinId = this.assetIdMap[query.asset.toUpperCase()];
    if (!coinId) return null;

    try {
      const response = await this.client.get('/simple/price', {
        params: {
          ids: coinId,
          vs_currencies: query.quote.toLowerCase(),
        },
      });

      const price = response.data[coinId]?.[query.quote.toLowerCase()];
      if (!price) return null;

      return {
        asset: query.asset.toUpperCase(),
        quote: query.quote.toUpperCase(),
        timestamp: new Date(),
        value: price,
        source: 'coingecko',
        metadata: {
          coinId,
        },
      };
    } catch (error) {
      console.error(`Coingecko API error:`, error);
      return null;
    }
  }

  async getHistoricalPrice(query: PriceQuery & { timestamp: Date }): Promise<PricePoint | null> {
    const coinId = this.assetIdMap[query.asset.toUpperCase()];
    if (!coinId) return null;

    try {
      const dateStr = this.formatDate(query.timestamp);
      
      const response = await this.client.get(`/coins/${coinId}/history`, {
        params: {
          date: dateStr,
        },
      });

      const price = response.data.market_data?.current_price?.[query.quote.toLowerCase()];
      if (!price) return null;

      return {
        asset: query.asset.toUpperCase(),
        quote: query.quote.toUpperCase(),
        timestamp: query.timestamp,
        value: price,
        source: 'coingecko',
        metadata: {
          coinId,
          date: dateStr,
        },
      };
    } catch (error) {
      console.error(`Coingecko historical API error:`, error);
      return null;
    }
  }

  async getHistoricalPrices(range: PriceRange): Promise<HistoricalPriceData | null> {
    const coinId = this.assetIdMap[range.asset.toUpperCase()];
    if (!coinId) return null;

    try {
      const fromTs = Math.floor(range.from.getTime() / 1000);
      const toTs = Math.floor(range.to.getTime() / 1000);

      const response = await this.client.get(`/coins/${coinId}/market_chart/range`, {
        params: {
          vs_currency: range.quote.toLowerCase(),
          from: fromTs,
          to: toTs,
        },
      });

      const prices = response.data.prices.map(([timestamp, value]: [number, number]) => ({
        timestamp: new Date(timestamp),
        value,
      }));

      return {
        asset: range.asset.toUpperCase(),
        quote: range.quote.toUpperCase(),
        prices,
        source: 'coingecko',
      };
    } catch (error) {
      console.error(`Coingecko range API error:`, error);
      return null;
    }
  }

  private formatDate(date: Date): string {
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    return `${day}-${month}-${year}`;
  }
}
