export type InvoiceType = 'FC' | 'FA' | 'AF'; // FC=Complete, FA=Abbreviated, AF=Self-billing
export type InvoiceDirection = 'issued' | 'received';

export interface InvoiceLine {
  lineNumber: number;
  description: string;
  quantity: number;
  unitPrice: number;
  discount?: number;
  taxRate: number;
  taxAmount: number;
  lineTotal: number;
}

export interface InvoiceParty {
  name: string;
  taxId: string; // NIF/CIF
  address: {
    street: string;
    city: string;
    postalCode: string;
    province: string;
    country: string;
  };
}

export interface CreateInvoiceInput {
  invoiceNumber: string;
  series?: string;
  issueDate: string;
  
  sellerEntityId: string;
  buyer: InvoiceParty;
  
  invoiceType: InvoiceType;
  direction: InvoiceDirection;
  
  lines: InvoiceLine[];
  currency?: string;
}

export interface FacturaeOptions {
  signatureRequired?: boolean;
  certificatePath?: string;
  certificatePassword?: string;
}
