export type PeppolDocumentType = 'invoice' | 'credit_note';

export interface PeppolParty {
  endpointId: string; // e.g., "0088:5060312345678"
  name: string;
  legalName?: string;
  vatId?: string;
  taxScheme?: string;
  companyId?: string;
  address: {
    streetName: string;
    additionalStreet?: string;
    cityName: string;
    postalZone: string;
    countrySubentity?: string;
    country: string; // ISO 3166-1 alpha-2
  };
  contact?: {
    name?: string;
    telephone?: string;
    email?: string;
  };
}

export interface PeppolTaxCategory {
  id: string; // "S" (standard), "Z" (zero), "E" (exempt), etc.
  percent?: number;
  taxScheme: string; // "VAT"
}

export interface PeppolInvoiceLine {
  id: string;
  quantity: number;
  unitCode: string; // UN/ECE Rec 20
  lineExtensionAmount: number;
  item: {
    name: string;
    description?: string;
    sellersItemId?: string;
    standardItemId?: string;
    classifiedTaxCategory: PeppolTaxCategory;
  };
  price: {
    priceAmount: number;
    baseQuantity?: number;
  };
  allowanceCharge?: Array<{
    chargeIndicator: boolean;
    amount: number;
    reason?: string;
  }>;
}

export interface PeppolInvoice {
  id: string;
  issueDate: string; // YYYY-MM-DD
  dueDate?: string;
  invoiceTypeCode: string; // "380" = invoice, "381" = credit note
  documentCurrencyCode: string;
  
  accountingSupplier: PeppolParty;
  accountingCustomer: PeppolParty;
  
  paymentMeans?: {
    paymentMeansCode: string; // "30" = credit transfer, "48" = card, etc.
    paymentId?: string;
    payeeFinancialAccount?: {
      id: string; // IBAN
      name?: string;
      financialInstitutionBranch?: {
        id: string; // BIC
      };
    };
  };
  
  taxTotal: Array<{
    taxAmount: number;
    taxSubtotal: Array<{
      taxableAmount: number;
      taxAmount: number;
      taxCategory: PeppolTaxCategory;
    }>;
  }>;
  
  legalMonetaryTotal: {
    lineExtensionAmount: number;
    taxExclusiveAmount: number;
    taxInclusiveAmount: number;
    allowanceTotalAmount?: number;
    chargeTotalAmount?: number;
    payableAmount: number;
  };
  
  invoiceLines: PeppolInvoiceLine[];
}
