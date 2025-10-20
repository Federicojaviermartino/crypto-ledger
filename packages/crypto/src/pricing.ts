
export interface PricePoint {
  symbol: string;
  quote: string;       // e.g. USD
  timestamp: Date;
  value: number;
  source: string;
}

export interface PriceProvider {
  getPriceAt(symbol: string, quote: string, at: Date): Promise<PricePoint>;
}

export class DummyPriceProvider implements PriceProvider {
  async getPriceAt(symbol: string, quote: string, at: Date): Promise<PricePoint> {
    return {
      symbol,
      quote,
      timestamp: at,
      value: 1, // dummy fixed price
      source: 'dummy',
    };
  }
}
