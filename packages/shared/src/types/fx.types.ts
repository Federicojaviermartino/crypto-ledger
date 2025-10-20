export interface ExchangeRate {
  fromCurrency: string;
  toCurrency: string;
  date: Date;
  rate: number;
  source: string;
}

export interface FxTranslationResult {
  originalAmount: number;
  originalCurrency: string;
  translatedAmount: number;
  targetCurrency: string;
  rate: number;
  translationDate: Date;
}
