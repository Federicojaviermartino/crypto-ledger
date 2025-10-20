export interface Dimension {
  id: string;
  code: string;
  name: string;
  description?: string;
  isActive: boolean;
}

export interface DimensionValue {
  id: string;
  dimensionId: string;
  code: string;
  name: string;
  description?: string;
  isActive: boolean;
  metadata?: Record<string, unknown>;
}

export interface PostingDimensionInput {
  dimensionCode: string;
  valueCode: string;
}

export type DimensionMap = Record<string, string>; // dimensionCode -> valueCode

export interface DimensionGrouping {
  dimensions: string[]; // Array of dimension codes to group by
  includeUndimensioned?: boolean;
}

export interface DimensionalBalance {
  dimensions: DimensionMap;
  accountCode: string;
  accountName: string;
  debit: number;
  credit: number;
  balance: number;
}
