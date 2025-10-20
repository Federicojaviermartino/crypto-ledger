import { PricePoint, PriceQuery, PriceRange, HistoricalPriceData } from '@crypto-ledger/shared/types/price.types';

export interface IPriceProvider {
  name: string;
  
  getCurrentPrice(query: PriceQuery): Promise<PricePoint | null>;
  
  getHistoricalPrice(query: PriceQuery & { timestamp: Date }): Promise<PricePoint | null>;
  
  getHistoricalPrices(range: PriceRange): Promise<HistoricalPriceData | null>;
  
  isAvailable(): Promise<boolean>;
}
