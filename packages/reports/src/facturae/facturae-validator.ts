import { DOMParser } from '@xmldom/xmldom';

/**
 * Facturae XML Validator
 * Validates generated XML against business rules
 */
export class FacturaeValidator {
  /**
   * Validate Facturae XML
   */
  validate(xml: string): {
    isValid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    try {
      const doc = new DOMParser().parseFromString(xml, 'text/xml');

      // Check root element
      if (doc.documentElement.localName !== 'Facturae') {
        errors.push('Root element must be Facturae');
      }

      // Check schema version
      const schemaVersion = doc.getElementsByTagName('SchemaVersion')[0]?.textContent;
      if (!schemaVersion || !schemaVersion.startsWith('3.2')) {
        errors.push('Schema version must be 3.2.x');
      }

      // Check invoice number
      const invoiceNumber = doc.getElementsByTagName('InvoiceNumber')[0]?.textContent;
      if (!invoiceNumber || invoiceNumber.trim().length === 0) {
        errors.push('Invoice number is required');
      }

      // Check issue date
      const issueDate = doc.getElementsByTagName('IssueDate')[0]?.textContent;
      if (!issueDate || !this.isValidDate(issueDate)) {
        errors.push('Valid issue date is required (YYYY-MM-DD)');
      }

      // Check currency
      const currency = doc.getElementsByTagName('InvoiceCurrencyCode')[0]?.textContent;
      if (!currency || !['EUR', 'USD', 'GBP'].includes(currency)) {
        errors.push('Valid currency code is required');
      }

      // Check totals
      const totalGross = parseFloat(
        doc.getElementsByTagName('TotalGrossAmount')[0]?.textContent || '0'
      );
      const totalTax = parseFloat(
        doc.getElementsByTagName('TotalTaxOutputs')[0]?.textContent || '0'
      );
      const invoiceTotal = parseFloat(
        doc.getElementsByTagName('InvoiceTotal')[0]?.textContent || '0'
      );

      if (Math.abs(invoiceTotal - (totalGross + totalTax)) > 0.01) {
        errors.push('Invoice total must equal gross amount + tax');
      }

      // Check items exist
      const items = doc.getElementsByTagName('InvoiceLine');
      if (items.length === 0) {
        errors.push('At least one invoice line is required');
      }
    } catch (error) {
      errors.push(`XML parsing error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Validate date format (YYYY-MM-DD)
   */
  private isValidDate(dateString: string): boolean {
    const regex = /^\d{4}-\d{2}-\d{2}$/;
    if (!regex.test(dateString)) return false;

    const date = new Date(dateString);
    return date instanceof Date && !isNaN(date.getTime());
  }
}
