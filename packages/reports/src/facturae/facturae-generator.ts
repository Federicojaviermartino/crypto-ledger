import { create } from 'xmlbuilder2';

/**
 * Facturae 3.2.x XML Generator
 * Generates XML according to Spanish Facturae specification
 */
export class FacturaeGenerator {
  
  /**
   * Generate Facturae 3.2.x XML from invoice data
   */
  generateXML(invoiceData: {
    invoiceNumber: string;
    invoiceDate: Date;
    invoiceType: string;
    supplier: {
      taxId: string;
      name: string;
      address: string;
      city: string;
      postalCode: string;
      country: string;
    };
    customer: {
      taxId: string;
      name: string;
      address: string;
      city: string;
      postalCode: string;
      country: string;
    };
    lines: Array<{
      description: string;
      quantity: number;
      unitPrice: number;
      discount: number;
      taxRate: number;
      subtotal: number;
      taxAmount: number;
      total: number;
    }>;
    subtotal: number;
    taxAmount: number;
    total: number;
    currency: string;
  }): string {
    const doc = create({ version: '1.0', encoding: 'UTF-8' })
      .ele('fe:Facturae', {
        'xmlns:fe': 'http://www.facturae.gob.es/formato/Versiones/Facturaev3_2_2.xml',
        'xmlns:ds': 'http://www.w3.org/2000/09/xmldsig#',
      })
      .ele('FileHeader')
        .ele('SchemaVersion').txt('3.2.2').up()
        .ele('Modality').txt('I').up() // I = Individual
        .ele('InvoiceIssuerType').txt('EM').up() // EM = Issuer
        .ele('Batch')
          .ele('BatchIdentifier').txt(invoiceData.invoiceNumber).up()
          .ele('InvoicesCount').txt('1').up()
          .ele('TotalInvoicesAmount')
            .ele('TotalAmount').txt(invoiceData.total.toFixed(2)).up()
          .up()
          .ele('TotalOutstandingAmount')
            .ele('TotalAmount').txt(invoiceData.total.toFixed(2)).up()
          .up()
          .ele('TotalExecutableAmount')
            .ele('TotalAmount').txt(invoiceData.total.toFixed(2)).up()
          .up()
          .ele('InvoiceCurrencyCode').txt(invoiceData.currency).up()
        .up()
      .up()
      .ele('Parties')
        .ele('SellerParty')
          .ele('TaxIdentification')
            .ele('PersonTypeCode').txt('J').up() // J = Legal entity
            .ele('ResidenceTypeCode').txt('R').up() // R = Resident
            .ele('TaxIdentificationNumber').txt(invoiceData.supplier.taxId).up()
          .up()
          .ele('LegalEntity')
            .ele('CorporateName').txt(invoiceData.supplier.name).up()
            .ele('AddressInSpain')
              .ele('Address').txt(invoiceData.supplier.address).up()
              .ele('PostCode').txt(invoiceData.supplier.postalCode).up()
              .ele('Town').txt(invoiceData.supplier.city).up()
              .ele('Province').txt(invoiceData.supplier.city).up()
              .ele('CountryCode').txt(invoiceData.supplier.country).up()
            .up()
          .up()
        .up()
        .ele('BuyerParty')
          .ele('TaxIdentification')
            .ele('PersonTypeCode').txt('J').up()
            .ele('ResidenceTypeCode').txt('R').up()
            .ele('TaxIdentificationNumber').txt(invoiceData.customer.taxId).up()
          .up()
          .ele('LegalEntity')
            .ele('CorporateName').txt(invoiceData.customer.name).up()
            .ele('AddressInSpain')
              .ele('Address').txt(invoiceData.customer.address).up()
              .ele('PostCode').txt(invoiceData.customer.postalCode).up()
              .ele('Town').txt(invoiceData.customer.city).up()
              .ele('Province').txt(invoiceData.customer.city).up()
              .ele('CountryCode').txt(invoiceData.customer.country).up()
            .up()
          .up()
        .up()
      .up()
      .ele('Invoices')
        .ele('Invoice')
          .ele('InvoiceHeader')
            .ele('InvoiceNumber').txt(invoiceData.invoiceNumber).up()
            .ele('InvoiceDocumentType').txt(this.mapInvoiceType(invoiceData.invoiceType)).up()
            .ele('InvoiceClass').txt('OO').up() // OO = Original
          .up()
          .ele('InvoiceIssueData')
            .ele('IssueDate').txt(this.formatDate(invoiceData.invoiceDate)).up()
            .ele('InvoiceCurrencyCode').txt(invoiceData.currency).up()
            .ele('TaxCurrencyCode').txt(invoiceData.currency).up()
            .ele('LanguageName').txt('es').up()
          .up()
          .ele('TaxesOutputs')
            .ele('Tax')
              .ele('TaxTypeCode').txt('01').up() // 01 = IVA
              .ele('TaxRate').txt(this.calculateAverageTaxRate(invoiceData.lines).toFixed(2)).up()
              .ele('TaxableBase')
                .ele('TotalAmount').txt(invoiceData.subtotal.toFixed(2)).up()
              .up()
              .ele('TaxAmount')
                .ele('TotalAmount').txt(invoiceData.taxAmount.toFixed(2)).up()
              .up()
            .up()
          .up()
          .ele('InvoiceTotals')
            .ele('TotalGrossAmount').txt(invoiceData.subtotal.toFixed(2)).up()
            .ele('TotalGrossAmountBeforeTaxes').txt(invoiceData.subtotal.toFixed(2)).up()
            .ele('TotalTaxOutputs').txt(invoiceData.taxAmount.toFixed(2)).up()
            .ele('TotalTaxesWithheld').txt('0.00').up()
            .ele('InvoiceTotal').txt(invoiceData.total.toFixed(2)).up()
            .ele('TotalOutstandingAmount').txt(invoiceData.total.toFixed(2)).up()
            .ele('TotalExecutableAmount').txt(invoiceData.total.toFixed(2)).up()
          .up()
          .ele('Items');

    // Add invoice lines
    const itemsElement = doc.last();
    invoiceData.lines.forEach((line, index) => {
      itemsElement
        .ele('InvoiceLine')
          .ele('ItemDescription').txt(line.description).up()
          .ele('Quantity').txt(line.quantity.toString()).up()
          .ele('UnitOfMeasure').txt('01').up() // 01 = Units
          .ele('UnitPriceWithoutTax').txt(line.unitPrice.toFixed(2)).up()
          .ele('TotalCost').txt(line.subtotal.toFixed(2)).up()
          .ele('GrossAmount').txt(line.subtotal.toFixed(2)).up()
          .ele('TaxesOutputs')
            .ele('Tax')
              .ele('TaxTypeCode').txt('01').up()
              .ele('TaxRate').txt(line.taxRate.toFixed(2)).up()
              .ele('TaxableBase')
                .ele('TotalAmount').txt(line.subtotal.toFixed(2)).up()
              .up()
              .ele('TaxAmount')
                .ele('TotalAmount').txt(line.taxAmount.toFixed(2)).up()
              .up()
            .up()
          .up()
        .up();
    });

    return doc.end({ prettyPrint: true });
  }

  /**
   * Map invoice type code
   */
  private mapInvoiceType(type: string): string {
    const mapping: Record<string, string> = {
      '380': 'FC', // Commercial invoice
      '381': 'FA', // Credit note
    };
    return mapping[type] || 'FC';
  }

  /**
   * Format date as YYYY-MM-DD
   */
  private formatDate(date: Date): string {
    return date.toISOString().split('T')[0];
  }

  /**
   * Calculate average tax rate from lines
   */
  private calculateAverageTaxRate(lines: Array<{ taxRate: number }>): number {
    if (lines.length === 0) return 0;
    const totalRate = lines.reduce((sum, line) => sum + line.taxRate, 0);
    return totalRate / lines.length;
  }

  /**
   * Generate XAdES signature placeholder
   * Note: Real signature requires certificate
   */
  generateSignaturePlaceholder(): string {
    return `
      <ds:Signature xmlns:ds="http://www.w3.org/2000/09/xmldsig#">
        <ds:SignedInfo>
          <ds:CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/>
          <ds:SignatureMethod Algorithm="http://www.w3.org/2000/09/xmldsig#rsa-sha1"/>
          <ds:Reference URI="">
            <ds:DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"/>
            <ds:DigestValue>PLACEHOLDER</ds:DigestValue>
          </ds:Reference>
        </ds:SignedInfo>
        <ds:SignatureValue>PLACEHOLDER_SIGNATURE</ds:SignatureValue>
        <ds:KeyInfo>
          <ds:X509Data>
            <ds:X509Certificate>PLACEHOLDER_CERTIFICATE</ds:X509Certificate>
          </ds:X509Data>
        </ds:KeyInfo>
      </ds:Signature>
    `.trim();
  }
}
