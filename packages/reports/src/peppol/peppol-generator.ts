import { create } from 'xmlbuilder2';

/**
 * Peppol BIS Billing 3.0 UBL Generator
 * Generates UBL 2.1 XML according to EN 16931 standard
 */
export class PeppolGenerator {
  
  /**
   * Generate Peppol BIS Billing 3.0 UBL XML
   */
  generateUBL(invoiceData: {
    invoiceNumber: string;
    invoiceDate: Date;
    invoiceType: string;
    supplier: {
      name: string;
      taxId: string;
      address: string;
      city: string;
      postalCode: string;
      country: string;
      peppolId?: string;
    };
    customer: {
      name: string;
      taxId: string;
      address: string;
      city: string;
      postalCode: string;
      country: string;
      peppolId?: string;
    };
    lines: Array<{
      description: string;
      quantity: number;
      unitPrice: number;
      taxRate: number;
      subtotal: number;
      taxAmount: number;
      total: number;
    }>;
    subtotal: number;
    taxAmount: number;
    total: number;
    currency: string;
    dueDate?: Date;
  }): string {
    const doc = create({ version: '1.0', encoding: 'UTF-8' })
      .ele('Invoice', {
        'xmlns': 'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2',
        'xmlns:cac': 'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2',
        'xmlns:cbc': 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2',
      })
      .ele('cbc:CustomizationID').txt('urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0').up()
      .ele('cbc:ProfileID').txt('urn:fdc:peppol.eu:2017:poacc:billing:01:1.0').up()
      .ele('cbc:ID').txt(invoiceData.invoiceNumber).up()
      .ele('cbc:IssueDate').txt(this.formatDate(invoiceData.invoiceDate)).up();

    // Due date
    if (invoiceData.dueDate) {
      doc.ele('cbc:DueDate').txt(this.formatDate(invoiceData.dueDate)).up();
    }

    doc
      .ele('cbc:InvoiceTypeCode').txt(this.mapInvoiceTypeCode(invoiceData.invoiceType)).up()
      .ele('cbc:DocumentCurrencyCode').txt(invoiceData.currency).up()
      .ele('cbc:BuyerReference').txt('BUYER-REF').up();

    // Supplier (AccountingSupplierParty)
    doc
      .ele('cac:AccountingSupplierParty')
        .ele('cac:Party')
          .ele('cbc:EndpointID', { schemeID: '0088' }).txt(invoiceData.supplier.peppolId || '0000000000000').up()
          .ele('cac:PartyName')
            .ele('cbc:Name').txt(invoiceData.supplier.name).up()
          .up()
          .ele('cac:PostalAddress')
            .ele('cbc:StreetName').txt(invoiceData.supplier.address).up()
            .ele('cbc:CityName').txt(invoiceData.supplier.city).up()
            .ele('cbc:PostalZone').txt(invoiceData.supplier.postalCode).up()
            .ele('cac:Country')
              .ele('cbc:IdentificationCode').txt(invoiceData.supplier.country).up()
            .up()
          .up()
          .ele('cac:PartyTaxScheme')
            .ele('cbc:CompanyID').txt(invoiceData.supplier.taxId).up()
            .ele('cac:TaxScheme')
              .ele('cbc:ID').txt('VAT').up()
            .up()
          .up()
          .ele('cac:PartyLegalEntity')
            .ele('cbc:RegistrationName').txt(invoiceData.supplier.name).up()
          .up()
        .up()
      .up();

    // Customer (AccountingCustomerParty)
    doc
      .ele('cac:AccountingCustomerParty')
        .ele('cac:Party')
          .ele('cbc:EndpointID', { schemeID: '0088' }).txt(invoiceData.customer.peppolId || '0000000000000').up()
          .ele('cac:PartyName')
            .ele('cbc:Name').txt(invoiceData.customer.name).up()
          .up()
          .ele('cac:PostalAddress')
            .ele('cbc:StreetName').txt(invoiceData.customer.address).up()
            .ele('cbc:CityName').txt(invoiceData.customer.city).up()
            .ele('cbc:PostalZone').txt(invoiceData.customer.postalCode).up()
            .ele('cac:Country')
              .ele('cbc:IdentificationCode').txt(invoiceData.customer.country).up()
            .up()
          .up()
          .ele('cac:PartyTaxScheme')
            .ele('cbc:CompanyID').txt(invoiceData.customer.taxId).up()
            .ele('cac:TaxScheme')
              .ele('cbc:ID').txt('VAT').up()
            .up()
          .up()
          .ele('cac:PartyLegalEntity')
            .ele('cbc:RegistrationName').txt(invoiceData.customer.name).up()
          .up()
        .up()
      .up();

    // Tax Total
    doc
      .ele('cac:TaxTotal')
        .ele('cbc:TaxAmount', { currencyID: invoiceData.currency }).txt(invoiceData.taxAmount.toFixed(2)).up()
        .ele('cac:TaxSubtotal')
          .ele('cbc:TaxableAmount', { currencyID: invoiceData.currency }).txt(invoiceData.subtotal.toFixed(2)).up()
          .ele('cbc:TaxAmount', { currencyID: invoiceData.currency }).txt(invoiceData.taxAmount.toFixed(2)).up()
          .ele('cac:TaxCategory')
            .ele('cbc:ID').txt('S').up() // S = Standard rate
            .ele('cbc:Percent').txt(this.calculateAverageTaxRate(invoiceData.lines).toFixed(2)).up()
            .ele('cac:TaxScheme')
              .ele('cbc:ID').txt('VAT').up()
            .up()
          .up()
        .up()
      .up();

    // Legal Monetary Total
    doc
      .ele('cac:LegalMonetaryTotal')
        .ele('cbc:LineExtensionAmount', { currencyID: invoiceData.currency }).txt(invoiceData.subtotal.toFixed(2)).up()
        .ele('cbc:TaxExclusiveAmount', { currencyID: invoiceData.currency }).txt(invoiceData.subtotal.toFixed(2)).up()
        .ele('cbc:TaxInclusiveAmount', { currencyID: invoiceData.currency }).txt(invoiceData.total.toFixed(2)).up()
        .ele('cbc:PayableAmount', { currencyID: invoiceData.currency }).txt(invoiceData.total.toFixed(2)).up()
      .up();

    // Invoice Lines
    invoiceData.lines.forEach((line, index) => {
      doc
        .ele('cac:InvoiceLine')
          .ele('cbc:ID').txt((index + 1).toString()).up()
          .ele('cbc:InvoicedQuantity', { unitCode: 'C62' }).txt(line.quantity.toString()).up() // C62 = Units
          .ele('cbc:LineExtensionAmount', { currencyID: invoiceData.currency }).txt(line.subtotal.toFixed(2)).up()
          .ele('cac:Item')
            .ele('cbc:Description').txt(line.description).up()
            .ele('cbc:Name').txt(line.description).up()
            .ele('cac:ClassifiedTaxCategory')
              .ele('cbc:ID').txt('S').up()
              .ele('cbc:Percent').txt(line.taxRate.toFixed(2)).up()
              .ele('cac:TaxScheme')
                .ele('cbc:ID').txt('VAT').up()
              .up()
            .up()
          .up()
          .ele('cac:Price')
            .ele('cbc:PriceAmount', { currencyID: invoiceData.currency }).txt(line.unitPrice.toFixed(2)).up()
          .up()
        .up();
    });

    return doc.end({ prettyPrint: true });
  }

  /**
   * Validate UBL against business rules
   */
  validateUBL(xml: string): {
    isValid: boolean;
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Basic validation rules (simplified)
    if (!xml.includes('CustomizationID')) {
      errors.push('Missing required CustomizationID');
    }

    if (!xml.includes('AccountingSupplierParty')) {
      errors.push('Missing required AccountingSupplierParty');
    }

    if (!xml.includes('AccountingCustomerParty')) {
      errors.push('Missing required AccountingCustomerParty');
    }

    if (!xml.includes('TaxTotal')) {
      warnings.push('Missing TaxTotal element');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Map invoice type to UBL code
   */
  private mapInvoiceTypeCode(type: string): string {
    const mapping: Record<string, string> = {
      '380': '380', // Commercial invoice
      '381': '381', // Credit note
      '383': '383', // Debit note
    };
    return mapping[type] || '380';
  }

  /**
   * Format date as YYYY-MM-DD
   */
  private formatDate(date: Date): string {
    return date.toISOString().split('T')[0];
  }

  /**
   * Calculate average tax rate
   */
  private calculateAverageTaxRate(lines: Array<{ taxRate: number }>): number {
    if (lines.length === 0) return 0;
    const totalRate = lines.reduce((sum, line) => sum + line.taxRate, 0);
    return totalRate / lines.length;
  }

  /**
   * Generate Peppol identifier from tax ID
   * Format: 0088:countrycode+taxid (ISO 6523)
   */
  generatePeppolId(country: string, taxId: string): string {
    return `0088:${country}${taxId}`;
  }
}
