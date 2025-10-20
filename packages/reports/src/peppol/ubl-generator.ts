import { create } from 'xmlbuilder2';
import { PeppolInvoice, PeppolDocumentType } from '@crypto-ledger/shared/types/peppol.types';

export class UblGenerator {
  private readonly namespaces = {
    'xmlns': 'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2',
    'xmlns:cac': 'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2',
    'xmlns:cbc': 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2',
  };

  generate(invoice: PeppolInvoice, documentType: PeppolDocumentType = 'invoice'): string {
    const rootElement = documentType === 'invoice' ? 'Invoice' : 'CreditNote';
    
    const root = create({ version: '1.0', encoding: 'UTF-8' })
      .ele(rootElement, this.namespaces);

    // Customization and profile ID (Peppol BIS Billing 3.0)
    root.ele('cbc:CustomizationID').txt('urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0');
    root.ele('cbc:ProfileID').txt('urn:fdc:peppol.eu:2017:poacc:billing:01:1.0');

    // Invoice identification
    root.ele('cbc:ID').txt(invoice.id);
    root.ele('cbc:IssueDate').txt(invoice.issueDate);
    if (invoice.dueDate) {
      root.ele('cbc:DueDate').txt(invoice.dueDate);
    }
    root.ele('cbc:InvoiceTypeCode').txt(invoice.invoiceTypeCode);
    root.ele('cbc:DocumentCurrencyCode').txt(invoice.documentCurrencyCode);

    // Supplier party
    this.addSupplierParty(root, invoice.accountingSupplier);

    // Customer party
    this.addCustomerParty(root, invoice.accountingCustomer);

    // Payment means
    if (invoice.paymentMeans) {
      this.addPaymentMeans(root, invoice.paymentMeans);
    }

    // Tax total
    this.addTaxTotal(root, invoice.taxTotal);

    // Legal monetary total
    this.addLegalMonetaryTotal(root, invoice.legalMonetaryTotal);

    // Invoice lines
    invoice.invoiceLines.forEach(line => {
      this.addInvoiceLine(root, line);
    });

    return root.end({ prettyPrint: true });
  }

  private addSupplierParty(parent: any, supplier: any): void {
    const supplierParty = parent.ele('cac:AccountingSupplierParty').ele('cac:Party');

    // Endpoint ID
    supplierParty.ele('cbc:EndpointID', { schemeID: this.extractSchemeId(supplier.endpointId) })
      .txt(this.extractId(supplier.endpointId));

    // Party identification
    if (supplier.companyId) {
      supplierParty.ele('cac:PartyIdentification')
        .ele('cbc:ID').txt(supplier.companyId);
    }

    // Party name
    supplierParty.ele('cac:PartyName').ele('cbc:Name').txt(supplier.name);

    // Postal address
    const address = supplierParty.ele('cac:PostalAddress');
    address.ele('cbc:StreetName').txt(supplier.address.streetName);
    if (supplier.address.additionalStreet) {
      address.ele('cbc:AdditionalStreetName').txt(supplier.address.additionalStreet);
    }
    address.ele('cbc:CityName').txt(supplier.address.cityName);
    address.ele('cbc:PostalZone').txt(supplier.address.postalZone);
    if (supplier.address.countrySubentity) {
      address.ele('cbc:CountrySubentity').txt(supplier.address.countrySubentity);
    }
    address.ele('cac:Country').ele('cbc:IdentificationCode').txt(supplier.address.country);

    // Tax scheme
    if (supplier.vatId) {
      const partyTaxScheme = supplierParty.ele('cac:PartyTaxScheme');
      partyTaxScheme.ele('cbc:CompanyID').txt(supplier.vatId);
      partyTaxScheme.ele('cac:TaxScheme').ele('cbc:ID').txt(supplier.taxScheme || 'VAT');
    }

    // Legal entity
    const legalEntity = supplierParty.ele('cac:PartyLegalEntity');
    legalEntity.ele('cbc:RegistrationName').txt(supplier.legalName || supplier.name);
    if (supplier.companyId) {
      legalEntity.ele('cbc:CompanyID').txt(supplier.companyId);
    }

    // Contact
    if (supplier.contact) {
      const contact = supplierParty.ele('cac:Contact');
      if (supplier.contact.name) contact.ele('cbc:Name').txt(supplier.contact.name);
      if (supplier.contact.telephone) contact.ele('cbc:Telephone').txt(supplier.contact.telephone);
      if (supplier.contact.email) contact.ele('cbc:ElectronicMail').txt(supplier.contact.email);
    }
  }

  private addCustomerParty(parent: any, customer: any): void {
    const customerParty = parent.ele('cac:AccountingCustomerParty').ele('cac:Party');

    // Endpoint ID
    customerParty.ele('cbc:EndpointID', { schemeID: this.extractSchemeId(customer.endpointId) })
      .txt(this.extractId(customer.endpointId));

    // Party name
    customerParty.ele('cac:PartyName').ele('cbc:Name').txt(customer.name);

    // Postal address
    const address = customerParty.ele('cac:PostalAddress');
    address.ele('cbc:StreetName').txt(customer.address.streetName);
    address.ele('cbc:CityName').txt(customer.address.cityName);
    address.ele('cbc:PostalZone').txt(customer.address.postalZone);
    address.ele('cac:Country').ele('cbc:IdentificationCode').txt(customer.address.country);

    // Tax scheme
    if (customer.vatId) {
      const partyTaxScheme = customerParty.ele('cac:PartyTaxScheme');
      partyTaxScheme.ele('cbc:CompanyID').txt(customer.vatId);
      partyTaxScheme.ele('cac:TaxScheme').ele('cbc:ID').txt(customer.taxScheme || 'VAT');
    }

    // Legal entity
    customerParty.ele('cac:PartyLegalEntity')
      .ele('cbc:RegistrationName').txt(customer.legalName || customer.name);
  }

  private addPaymentMeans(parent: any, paymentMeans: any): void {
    const pm = parent.ele('cac:PaymentMeans');
    pm.ele('cbc:PaymentMeansCode').txt(paymentMeans.paymentMeansCode);
    
    if (paymentMeans.paymentId) {
      pm.ele('cbc:PaymentID').txt(paymentMeans.paymentId);
    }

    if (paymentMeans.payeeFinancialAccount) {
      const account = pm.ele('cac:PayeeFinancialAccount');
      account.ele('cbc:ID').txt(paymentMeans.payeeFinancialAccount.id);
      
      if (paymentMeans.payeeFinancialAccount.name) {
        account.ele('cbc:Name').txt(paymentMeans.payeeFinancialAccount.name);
      }

      if (paymentMeans.payeeFinancialAccount.financialInstitutionBranch) {
        account.ele('cac:FinancialInstitutionBranch')
          .ele('cbc:ID').txt(paymentMeans.payeeFinancialAccount.financialInstitutionBranch.id);
      }
    }
  }

  private addTaxTotal(parent: any, taxTotals: any[]): void {
    taxTotals.forEach(taxTotal => {
      const tt = parent.ele('cac:TaxTotal');
      tt.ele('cbc:TaxAmount', { currencyID: 'EUR' }).txt(taxTotal.taxAmount.toFixed(2));

      taxTotal.taxSubtotal.forEach((subtotal: any) => {
        const ts = tt.ele('cac:TaxSubtotal');
        ts.ele('cbc:TaxableAmount', { currencyID: 'EUR' }).txt(subtotal.taxableAmount.toFixed(2));
        ts.ele('cbc:TaxAmount', { currencyID: 'EUR' }).txt(subtotal.taxAmount.toFixed(2));

        const category = ts.ele('cac:TaxCategory');
        category.ele('cbc:ID').txt(subtotal.taxCategory.id);
        if (subtotal.taxCategory.percent !== undefined) {
          category.ele('cbc:Percent').txt(subtotal.taxCategory.percent.toFixed(2));
        }
        category.ele('cac:TaxScheme').ele('cbc:ID').txt(subtotal.taxCategory.taxScheme);
      });
    });
  }

  private addLegalMonetaryTotal(parent: any, total: any): void {
    const lmt = parent.ele('cac:LegalMonetaryTotal');
    lmt.ele('cbc:LineExtensionAmount', { currencyID: 'EUR' }).txt(total.lineExtensionAmount.toFixed(2));
    lmt.ele('cbc:TaxExclusiveAmount', { currencyID: 'EUR' }).txt(total.taxExclusiveAmount.toFixed(2));
    lmt.ele('cbc:TaxInclusiveAmount', { currencyID: 'EUR' }).txt(total.taxInclusiveAmount.toFixed(2));
    
    if (total.allowanceTotalAmount) {
      lmt.ele('cbc:AllowanceTotalAmount', { currencyID: 'EUR' }).txt(total.allowanceTotalAmount.toFixed(2));
    }
    if (total.chargeTotalAmount) {
      lmt.ele('cbc:ChargeTotalAmount', { currencyID: 'EUR' }).txt(total.chargeTotalAmount.toFixed(2));
    }
    
    lmt.ele('cbc:PayableAmount', { currencyID: 'EUR' }).txt(total.payableAmount.toFixed(2));
  }

  private addInvoiceLine(parent: any, line: any): void {
    const il = parent.ele('cac:InvoiceLine');
    il.ele('cbc:ID').txt(line.id);
    
    const quantity = il.ele('cbc:InvoicedQuantity', { unitCode: line.unitCode });
    quantity.txt(line.quantity.toString());

    il.ele('cbc:LineExtensionAmount', { currencyID: 'EUR' }).txt(line.lineExtensionAmount.toFixed(2));

    // Item
    const item = il.ele('cac:Item');
    item.ele('cbc:Name').txt(line.item.name);
    
    if (line.item.description) {
      item.ele('cbc:Description').txt(line.item.description);
    }

    if (line.item.sellersItemId) {
      item.ele('cac:SellersItemIdentification').ele('cbc:ID').txt(line.item.sellersItemId);
    }

    if (line.item.standardItemId) {
      item.ele('cac:StandardItemIdentification').ele('cbc:ID').txt(line.item.standardItemId);
    }

    // Tax category
    const taxCategory = item.ele('cac:ClassifiedTaxCategory');
    taxCategory.ele('cbc:ID').txt(line.item.classifiedTaxCategory.id);
    if (line.item.classifiedTaxCategory.percent !== undefined) {
      taxCategory.ele('cbc:Percent').txt(line.item.classifiedTaxCategory.percent.toFixed(2));
    }
    taxCategory.ele('cac:TaxScheme').ele('cbc:ID').txt(line.item.classifiedTaxCategory.taxScheme);

    // Price
    const price = il.ele('cac:Price');
    price.ele('cbc:PriceAmount', { currencyID: 'EUR' }).txt(line.price.priceAmount.toFixed(2));
    if (line.price.baseQuantity) {
      price.ele('cbc:BaseQuantity', { unitCode: line.unitCode }).txt(line.price.baseQuantity.toString());
    }
  }

  private extractSchemeId(endpointId: string): string {
    return endpointId.split(':')[0] || '0088';
  }

  private extractId(endpointId: string): string {
    return endpointId.split(':')[1] || endpointId;
  }
}
