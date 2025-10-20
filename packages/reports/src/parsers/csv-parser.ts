import { parse } from 'csv-parse/sync';

/**
 * CSV Bank Statement Parser
 * Supports common bank CSV formats
 */
export class CsvStatementParser {
  
  /**
   * Parse CSV bank statement
   */
  async parseStatement(csvContent: string, format: 'generic' | 'caixabank' | 'santander' = 'generic'): Promise<{
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
    const records = parse(csvContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });

    switch (format) {
      case 'caixabank':
        return this.parseCaixabank(records);
      case 'santander':
        return this.parseSantander(records);
      default:
        return this.parseGeneric(records);
    }
  }

  /**
   * Parse generic CSV format
   */
  private parseGeneric(records: any[]): any {
    const transactions = records.map(record => ({
      date: this.parseDate(record.Date || record.date || record.Fecha),
      valueDate: this.parseDate(record.ValueDate || record.value_date || record.FechaValor || record.Date),
      amount: this.parseAmount(record.Amount || record.amount || record.Importe),
      description: record.Description || record.description || record.Concepto || '',
      reference: record.Reference || record.reference || record.Referencia,
    }));

    const amounts = transactions.map(t => t.amount);
    const openingBalance = 0; // Would need to be in CSV or provided
    const closingBalance = amounts.reduce((sum, amt) => sum + amt, openingBalance);

    return {
      openingBalance,
      closingBalance,
      transactions,
    };
  }

  /**
   * Parse CaixaBank format
   */
  private parseCaixabank(records: any[]): any {
    return this.parseGeneric(records);
  }

  /**
   * Parse Santander format
   */
  private parseSantander(records: any[]): any {
    return this.parseGeneric(records);
  }

  /**
   * Parse date from various formats
   */
  private parseDate(dateStr: string): Date {
    if (!dateStr) return new Date();

    // Try DD/MM/YYYY
    const ddmmyyyy = /^(\d{2})\/(\d{2})\/(\d{4})$/;
    const match = dateStr.match(ddmmyyyy);
    if (match) {
      return new Date(`${match[3]}-${match[2]}-${match[1]}`);
    }

    // Try ISO format
    return new Date(dateStr);
  }

  /**
   * Parse amount (handles commas as decimal separator)
   */
  private parseAmount(amountStr: string): number {
    if (!amountStr) return 0;

    // Remove thousands separators and convert comma to dot
    const cleaned = amountStr
      .replace(/\./g, '') // Remove dots (thousands)
      .replace(',', '.'); // Convert comma to dot (decimal)

    return parseFloat(cleaned);
  }
}
