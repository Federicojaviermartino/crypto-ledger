export type EntityType = 'parent' | 'subsidiary' | 'branch';

export interface Entity {
  id: string;
  code: string;
  name: string;
  currency: string;
  parentEntityId?: string;
  entityType: EntityType;
  country?: string;
  taxId?: string;
  isActive: boolean;
}

export interface IntercompanyRelation {
  id: string;
  fromEntityId: string;
  toEntityId: string;
  relationshipType: 'parent_child' | 'sibling' | 'affiliate';
  arAccountCode?: string;
  apAccountCode?: string;
}

export interface CreateEntityInput {
  code: string;
  name: string;
  currency: string;
  parentEntityId?: string;
  entityType: EntityType;
  country?: string;
  taxId?: string;
}

export interface ConsolidationInput {
  period: string; // YYYY-MM
  reportingCurrency: string;
  fxRateSource?: string;
  eliminateIntercompany?: boolean;
}

export interface ConsolidatedBalance {
  accountCode: string;
  accountName: string;
  entityBalances: Array<{
    entityCode: string;
    entityName: string;
    currency: string;
    localAmount: number;
    translatedAmount: number;
    fxRate: number;
  }>;
  consolidatedAmount: number;
  eliminations: number;
  finalAmount: number;
}
