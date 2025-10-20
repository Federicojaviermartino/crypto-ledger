import { DOMParser } from '@xmldom/xmldom';
import { BankTransactionImport } from '@crypto-ledger/shared/types/reconciliation.types';

export class Camt053Parser {
  parse(xmlContent: string): {
    openingBalance: number;
    closingBalance: number;
    transactions: BankTransactionImport[];
  } {
    const doc = new DOMParser().parseFromString(xmlContent, 'text/xml');

    const openingBalance = this.extractBalance(doc, 'OPBD');
    const closingBalance = this.extractBalance(doc, 'CLBD');
    
    const transactions = this.extractTransactions(doc);

    return {
      openingBalance,
      closingBalance,
      transactions,
    };
  }

  private extractBalance(doc: Document, balanceType: string): number {
    const balances = doc.getElementsByTagName('Bal');
    
    for (let i = 0; i < balances.length; i++) {
      const balance = balances[i];
      const type = balance.getElementsByTagName('Tp')[0]
        ?.getElementsByTagName('CdOrPrtry')[0]
        ?.getElementsByTagName('Cd')[0]
        ?.textContent;
      
      if (type === balanceType) {
        const amountNode = balance.getElementsByTagName('Amt')[0];
        const cdtDbtInd = balance.getElementsByTagName('CdtDbtInd')[0]?.textContent;
        
        let amount = parseFloat(amountNode?.textContent || '0');
        if (cdtDbtInd === 'DBIT') {
          amount = -amount;
        }
        
        return amount;
      }
    }
    
    return 0;
  }

  private extractTransactions(doc: Document): BankTransactionImport[] {
    const entries = doc.getElementsByTagName('Ntry');
    const transactions: BankTransactionImport[] = [];

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      
      const amount = parseFloat(
        entry.getElementsByTagName('Amt')[0]?.textContent || '0'
      );
      
      const cdtDbtInd = entry.getElementsByTagName('CdtDbtInd')[0]?.textContent;
      const transactionType = cdtDbtInd === 'CRDT' ? 'credit' : 'debit';
      
      const bookingDate = entry.getElementsByTagName('BookgDt')[0]
        ?.getElementsByTagName('Dt')[0]?.textContent || '';
      
      const valueDate = entry.getElementsByTagName('ValDt')[0]
        ?.getElementsByTagName('Dt')[0]?.textContent;
      
      // Extract description from various possible fields
      const description = this.extractDescription(entry);
      
      // Extract counterparty
      const counterparty = this.extractCounterparty(entry);
      
      // Extract reference
      const reference = entry.getElementsByTagName('AcctSvcrRef')[0]?.textContent;

      transactions.push({
        transactionDate: bookingDate,
        valueDate: valueDate || undefined,
        amount: Math.abs(amount),
        currency: entry.getElementsByTagName('Amt')[0]?.getAttribute('Ccy') || 'EUR',
        counterpartyName: counterparty.name,
        counterpartyAccount: counterparty.account,
        description,
        referenceNumber: reference,
        transactionType,
      });
    }

    return transactions;
  }

  private extractDescription(entry: Element): string {
    // Try different description fields
    const addtlInfo = entry.getElementsByTagName('AddtlNtryInf')[0]?.textContent;
    if (addtlInfo) return addtlInfo;

    const rmtInf = entry.getElementsByTagName('RmtInf')[0]
      ?.getElementsByTagName('Ustrd')[0]?.textContent;
    if (rmtInf) return rmtInf;

    return '';
  }

  private extractCounterparty(entry: Element): { name?: string; account?: string } {
    const party = entry.getElementsByTagName('RltdPties')[0];
    if (!party) return {};

    const name = party.getElementsByTagName('Dbtr')[0]
      ?.getElementsByTagName('Nm')[0]?.textContent ||
      party.getElementsByTagName('Cdtr')[0]
        ?.getElementsByTagName('Nm')[0]?.textContent;

    const account = party.getElementsByTagName('DbtrAcct')[0]
      ?.getElementsByTagName('IBAN')[0]?.textContent ||
      party.getElementsByTagName('CdtrAcct')[0]
        ?.getElementsByTagName('IBAN')[0]?.textContent;

    return { name: name || undefined, account: account || undefined };
  }
}
