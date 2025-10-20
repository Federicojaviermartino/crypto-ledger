import { parse } from 'csv-parse/sync';
import { BankTransactionImport } from '@crypto-ledger/shared/types/reconciliation.types';

export interface CsvMapping {
  dateColumn: string;
  amountColumn: string;
  descriptionColumn: string;
  referenceColumn?: string;
  counterpartyColumn?: string;
  dateFormat?: string;
}

export class CsvParser {
  parse(csvContent: string, mapping: CsvMapping): BankTransactionImport[] {
    const records = parse(csvContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });

    return records.map((record: any) => {
      const amount = this.parseAmount(record[mapping.amountColumn]);
      
      return {
        transactionDate: this.parseDate(record[mapping.dateColumn], mapping.dateFormat),
        amount: Math.abs(amount),
        currency: 'EUR', // Default, should be configurable
        description: record[mapping.descriptionColumn] || '',
        referenceNumber: mapping.referenceColumn ? record[mapping.referenceColumn] : undefined,
        counterpartyName: mapping.counterpartyColumn ? record[mapping.counterpartyColumn] : undefined,
        transactionType: amount >= 0 ? 'credit' : 'debit',
      };
    });
  }

  private parseAmount(amountStr: string): number {
    // Handle various formats: "1,234.56", "1.234,56", "-500.00"
    const cleaned = amountStr
      .replace(/[^\d.,-]/g, '') // Remove currency symbols
      .replace(',', '.'); // Normalize decimal separator
    
    return parseFloat(cleaned);
  }

  private parseDate(dateStr: string, format?: string): string {
    // Simple date parsing, production would use date-fns or luxon
    // Assumes YYYY-MM-DD or DD/MM/YYYY
    
    if (dateStr.includes('-')) {
      // YYYY-MM-DD format
      return dateStr;
    } else if (dateStr.includes('/')) {
      // DD/MM/YYYY format
      const [day, month, year] = dateStr.split('/');
      return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }
    
    return dateStr;
  }
}
