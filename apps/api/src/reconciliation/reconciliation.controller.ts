import { Controller, Get, Post, Body, Param, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ReconciliationService } from './reconciliation.service';

/**
 * Controller for bank reconciliation operations
 */
@Controller('reconciliation')
export class ReconciliationController {
  constructor(private readonly reconciliationService: ReconciliationService) {}

  @Post('bank/:bankAccountId/import/csv')
  @UseInterceptors(FileInterceptor('file'))
  async importCsv(
    @Param('bankAccountId') bankAccountId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { statementDate: string; format?: 'generic' | 'caixabank' | 'santander' },
  ) {
    const csvContent = file.buffer.toString('utf-8');
    const statementDate = new Date(body.statementDate);
    const format = body.format || 'generic';

    return this.reconciliationService.importCsvStatement(
      bankAccountId,
      csvContent,
      statementDate,
      format
    );
  }

  @Post('bank/:bankAccountId/import/camt053')
  @UseInterceptors(FileInterceptor('file'))
  async importCamt053(
    @Param('bankAccountId') bankAccountId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { statementDate: string },
  ) {
    const xmlContent = file.buffer.toString('utf-8');
    const statementDate = new Date(body.statementDate);

    return this.reconciliationService.importCamt053Statement(
      bankAccountId,
      xmlContent,
      statementDate
    );
  }

  @Get('transactions/:id/matches')
  async findMatches(@Param('id') id: string) {
    return this.reconciliationService.findMatches(id);
  }

  @Post('transactions/:id/match/:entryId')
  async manualMatch(
    @Param('id') transactionId: string,
    @Param('entryId') entryId: string,
  ) {
    return this.reconciliationService.manualMatch(transactionId, entryId);
  }

  @Post('bank/:bankAccountId/auto-reconcile')
  async autoReconcile(
    @Param('bankAccountId') bankAccountId: string,
    @Body() body: { minScore?: number },
  ) {
    return this.reconciliationService.autoReconcile(
      bankAccountId,
      body.minScore || 0.95
    );
  }

  @Get('bank/:bankAccountId/unmatched')
  async getUnmatched(@Param('bankAccountId') bankAccountId: string) {
    return this.reconciliationService.getUnmatched(bankAccountId);
  }
}
