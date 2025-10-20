import { DOMParser } from '@xmldom/xmldom';
import { PeppolInvoice } from '@crypto-ledger/shared/types/peppol.types';

export class UblParser {
  parse(xml: string): PeppolInvoice {
    const doc = new DOMParser().parseFromString(xml, 'text/xml');

    // Check for parsing errors
    const parseErrors = doc.getElementsByTagName('parsererror');
    if (parseErrors.length > 0) {
      throw new Error('Invalid UBL XML: ' + parseErrors[0].textContent);
    }

    return {
      id: this.getTextContent(doc, 'cbc:ID'),
      issueDate: this.getTextContent(doc, 'cbc:IssueDate'),
      dueDate: this.getTextContent(doc, 'cbc:DueDate') || undefined,
      invoiceTypeCode: this.getTextContent(doc, 'cbc:InvoiceTypeCode'),
      documentCurrencyCode: this.getTextContent(doc, 'cbc:DocumentCurrencyCode'),
      
      accountingSupplier: this.parseParty(doc, 'cac:AccountingSupplierParty'),
      accountingCustomer: this.parseParty(doc, 'cac:AccountingCustomerParty'),
      
      paymentMeans: this.parsePaymentMeans(doc),
      taxTotal: this.parseTaxTotal(doc),
      legalMonetaryTotal: this.parseLegalMonetaryTotal(doc),
      invoiceLines: this.parseInvoiceLines(doc),
    };
  }

  private parseParty(doc: Document, parentTag: string): any {
    const parent = doc.getElementsByTagName(parentTag)[0];
    if (!parent) throw new Error(`${parentTag} not found`);

    const party = parent.getElementsByTagName('cac:Party')[0];

    return {
      endpointId: this.getTextContent(party as any, 'cbc:EndpointID'),
      name: this.getTextContent(party as any, 'cbc:Name'),
      legalName: this.getTextContent(party as any, 'cbc:RegistrationName'),
      vatId: this.getTextContent(party as any, 'cbc:CompanyID'),
      address: {
        streetName: this.getTextContent(party as any, 'cbc:StreetName'),
        cityName: this.getTextContent(party as any, 'cbc:CityName'),
        postalZone: this.getTextContent(party as any, 'cbc:PostalZone'),
        country: this.getTextContent(party as any, 'cbc:IdentificationCode'),
      },
    };
  }

  private parsePaymentMeans(doc: Document): any {
    const pm = doc.getElementsByTagName('cac:PaymentMeans')[0];
    if (!pm) return undefined;

    return {
      paymentMeansCode: this.getTextContent(pm as any, 'cbc:PaymentMeansCode'),
      paymentId: this.getTextContent(pm as any, 'cbc:PaymentID') || undefined,
    };
  }

  private parseTaxTotal(doc: Document): any[] {
    const taxTotals = doc.getElementsByTagName('cac:TaxTotal');
    
    return Array.from(taxTotals).map(tt => ({
      taxAmount: parseFloat(this.getTextContent(tt as any, 'cbc:TaxAmount')),
      taxSubtotal: Array.from(tt.getElementsByTagName('cac:TaxSubtotal')).map(ts => ({
        taxableAmount: parseFloat(this.getTextContent(ts as any, 'cbc:TaxableAmount')),
        taxAmount: parseFloat(this.getTextContent(ts as any, 'cbc:TaxAmount')),
        taxCategory: {
          id: this.getTextContent(ts as any, 'cbc:ID'),
          percent: parseFloat(this.getTextContent(ts as any, 'cbc:Percent') || '0'),
          taxScheme: 'VAT',
        },
      })),
    }));
  }

  private parseLegalMonetaryTotal(doc: Document): any {
    const lmt = doc.getElementsByTagName('cac:LegalMonetaryTotal')[0];

    return {
      lineExtensionAmount: parseFloat(this.getTextContent(lmt as any, 'cbc:LineExtensionAmount')),
      taxExclusiveAmount: parseFloat(this.getTextContent(lmt as any, 'cbc:TaxExclusiveAmount')),
      taxInclusiveAmount: parseFloat(this.getTextContent(lmt as any, 'cbc:TaxInclusiveAmount')),
      payableAmount: parseFloat(this.getTextContent(lmt as any, 'cbc:PayableAmount')),
    };
  }

  private parseInvoiceLines(doc: Document): any[] {
    const lines = doc.getElementsByTagName('cac:InvoiceLine');

    return Array.from(lines).map(line => {
      const quantity = line.getElementsByTagName('cbc:InvoicedQuantity')[0];
      
      return {
        id: this.getTextContent(line as any, 'cbc:ID'),
        quantity: parseFloat(quantity?.textContent || '0'),
        unitCode: quantity?.getAttribute('unitCode') || 'C62',
        lineExtensionAmount: parseFloat(this.getTextContent(line as any, 'cbc:LineExtensionAmount')),
        item: {
          name: this.getTextContent(line as any, 'cbc:Name'),
          description: this.getTextContent(line as any, 'cbc:Description') || undefined,
          classifiedTaxCategory: {
            id: this.getTextContent(line as any, 'cbc:ID'),
            percent: parseFloat(this.getTextContent(line as any, 'cbc:Percent') || '0'),
            taxScheme: 'VAT',
          },
        },
        price: {
          priceAmount: parseFloat(this.getTextContent(line as any, 'cbc:PriceAmount')),
        },
      };
    });
  }

  private getTextContent(parent: any, tagName: string): string {
    const elements = parent.getElementsByTagName(tagName);
    return elements[0]?.textContent || '';
  }
}
