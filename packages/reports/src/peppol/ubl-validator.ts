import { DOMParser } from '@xmldom/xmldom';

export class UblValidator {
  validate(xml: string): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    try {
      const doc = new DOMParser().parseFromString(xml, 'text/xml');

      // Check XML parsing
      const parseErrors = doc.getElementsByTagName('parsererror');
      if (parseErrors.length > 0) {
        errors.push('XML parsing error');
        return { valid: false, errors };
      }

      // EN 16931 mandatory fields
      this.checkMandatoryField(doc, 'cbc:ID', 'Invoice number', errors);
      this.checkMandatoryField(doc, 'cbc:IssueDate', 'Issue date', errors);
      this.checkMandatoryField(doc, 'cbc:InvoiceTypeCode', 'Invoice type code', errors);
      this.checkMandatoryField(doc, 'cbc:DocumentCurrencyCode', 'Currency code', errors);

      // Supplier
      this.checkMandatoryField(doc, 'cac:AccountingSupplierParty', 'Supplier party', errors);
      
      // Customer
      this.checkMandatoryField(doc, 'cac:AccountingCustomerParty', 'Customer party', errors);

      // Monetary totals
      this.checkMandatoryField(doc, 'cac:LegalMonetaryTotal', 'Monetary totals', errors);
      this.checkMandatoryField(doc, 'cbc:PayableAmount', 'Payable amount', errors);

      // At least one invoice line
      const lines = doc.getElementsByTagName('cac:InvoiceLine');
      if (lines.length === 0) {
        errors.push('At least one invoice line is required');
      }

      // Tax total
      this.checkMandatoryField(doc, 'cac:TaxTotal', 'Tax total', errors);

      // Business rules
      this.validateBusinessRules(doc, errors);

      return {
        valid: errors.length === 0,
        errors,
      };
    } catch (error: any) {
      errors.push('Validation error: ' + error.message);
      return { valid: false, errors };
    }
  }

  private checkMandatoryField(doc: Document, tagName: string, fieldName: string, errors: string[]): void {
    const elements = doc.getElementsByTagName(tagName);
    if (elements.length === 0) {
      errors.push(`Missing required field: ${fieldName} (${tagName})`);
    }
  }

  private validateBusinessRules(doc: Document, errors: string[]): void {
    // BR-1: Invoice total must equal sum of line amounts + tax
    const lineExtension = this.getAmount(doc, 'cbc:LineExtensionAmount');
    const taxTotal = this.getAmount(doc, 'cbc:TaxAmount');
    const payable = this.getAmount(doc, 'cbc:PayableAmount');

    if (Math.abs((lineExtension + taxTotal) - payable) > 0.01) {
      errors.push(`BR-1: Invoice total (${payable}) must equal line total (${lineExtension}) + tax (${taxTotal})`);
    }

    // BR-CO-15: Invoice currency code must be valid ISO 4217
    const currency = doc.getElementsByTagName('cbc:DocumentCurrencyCode')[0]?.textContent;
    if (currency && !this.isValidCurrencyCode(currency)) {
      errors.push(`BR-CO-15: Invalid currency code: ${currency}`);
    }

    // BR-CO-3: Tax category must be valid
    const taxCategories = doc.getElementsByTagName('cac:TaxCategory');
    Array.from(taxCategories).forEach(cat => {
      const id = cat.getElementsByTagName('cbc:ID')[0]?.textContent;
      if (id && !this.isValidTaxCategory(id)) {
        errors.push(`BR-CO-3: Invalid tax category: ${id}`);
      }
    });
  }

  private getAmount(doc: Document, tagName: string): number {
    const element = doc.getElementsByTagName(tagName)[0];
    return parseFloat(element?.textContent || '0');
  }

  private isValidCurrencyCode(code: string): boolean {
    const validCodes = ['EUR', 'USD', 'GBP', 'SEK', 'NOK', 'DKK', 'CHF'];
    return validCodes.includes(code);
  }

  private isValidTaxCategory(code: string): boolean {
    const validCategories = ['S', 'Z', 'E', 'AE', 'K', 'G', 'O', 'L', 'M'];
    return validCategories.includes(code);
  }
}
