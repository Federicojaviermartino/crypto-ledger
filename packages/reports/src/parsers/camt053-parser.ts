import { DOMParser } from '@xmldom/xmldom';

/**
 * ISO 20022 camt.053 XML Parser
 * Parses bank-to-customer statements
 */
export class Camt053Parser {
  
  /**
   * Parse camt.053 XML statement
   */
  async parseStatement(xmlContent: string): Promise<{
    openingBalance: number;
    closingBalance: number;
    transactions: Array<{
      date: Date;
      valueDate: Date;
      amount: number;
      description: string;
      reference?: string;
    }>;
  }> {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlContent, 'text/xml');

    // Extract balances
    const openingBalance = this.extractBalance(doc, 'OPBD'); // Opening booked
    const closingBalance = this.extractBalance(doc, 'CLBD'); // Closing booked

    // Extract transactions
    const entries = doc.getElementsByTagName('Ntry');
    const transactions = [];

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      
      const bookingDate = this.getElementText(entry, 'BookgDt/Dt');
      const valueDate = this.getElementText(entry, 'ValDt/Dt');
      const amountNode = entry.getElementsByTagName('Amt')[0];
      const amount = parseFloat(amountNode?.textContent || '0');
      const creditDebit = this.getElementText(entry, 'CdtDbtInd');
      
      const actualAmount = creditDebit === 'DBIT' ? -amount : amount;

      const description = this.getElementText(entry, 'NtryDtls/TxDtls/RmtInf/Ustrd') ||
                         this.getElementText(entry, 'AddtlNtryInf') ||
                         'No description';

      const reference = this.getElementText(entry, 'AcctSvcrRef');

      transactions.push({
        date: new Date(bookingDate),
        valueDate: new Date(valueDate),
        amount: actualAmount,
        description,
        reference,
      });
    }

    return {
      openingBalance,
      closingBalance,
      transactions,
    };
  }

  /**
   * Extract balance from XML
   */
  private extractBalance(doc: Document, balanceType: string): number {
    const balances = doc.getElementsByTagName('Bal');

    for (let i = 0; i < balances.length; i++) {
      const balance = balances[i];
      const type = this.getElementText(balance, 'Tp/CdOrPrtry/Cd');

      if (type === balanceType) {
        const amountNode = balance.getElementsByTagName('Amt')[0];
        const amount = parseFloat(amountNode?.textContent || '0');
        const creditDebit = this.getElementText(balance, 'CdtDbtInd');
        
        return creditDebit === 'DBIT' ? -amount : amount;
      }
    }

    return 0;
  }

  /**
   * Get text content from element by tag name
   */
  private getElementText(parent: Element | Document, tagPath: string): string {
    const tags = tagPath.split('/');
    let current: any = parent;

    for (const tag of tags) {
      const elements = current.getElementsByTagName(tag);
      if (elements.length === 0) return '';
      current = elements[0];
    }

    return current.textContent || '';
  }
}
