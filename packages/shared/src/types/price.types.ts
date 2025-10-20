export type PriceSource = 'coingecko' | 'ccxt' | 'dummy';

export interface PricePoint {
  asset: string;
  quote: string;
  timestamp: Date;
  value: number;
  source: PriceSource;
  metadata?: Record<string, unknown>;
}

export interface PriceQuery {
  asset: string;
  quote: string;
  timestamp?: Date; // If undefined, use current
}

export interface PriceRange {
  asset: string;
  quote: string;
  from: Date;
  to: Date;
  interval?: 'hourly' | 'daily';
}

export interface HistoricalPriceData {
  asset: string;
  quote: string;
  prices: Array<{
    timestamp: Date;
    value: number;
  }>;
  source: PriceSource;
}
