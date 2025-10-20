export type SiiSubmissionType = 'issued' | 'received';
export type SiiStatus = 'pending' | 'submitted' | 'accepted' | 'rejected';

export interface SiiInvoiceData {
  invoiceNumber: string;
  series?: string;
  issueDate: Date;
  
  // Parties
  sellerTaxId: string;
  sellerName: string;
  buyerTaxId: string;
  buyerName: string;
  buyerCountry: string;
  
  // Amounts
  baseAmount: number;
  taxAmount: number;
  totalAmount: number;
  
  // Classification
  invoiceType: string;
  operationKey: string; // SII operation key
  vatType?: string;
}

export interface SiiSubmissionResult {
  success: boolean;
  statusCode: number;
  responseCode?: string;
  responseMessage?: string;
  registrationId?: string;
  errors?: Array<{
    code: string;
    message: string;
  }>;
}

export interface SiiConfig {
  endpoint: string;
  certificatePath?: string;
  certificatePassword?: string;
  environment: 'production' | 'sandbox';
  nif: string; // Company NIF
}
