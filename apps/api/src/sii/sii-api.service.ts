import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { SiiService } from '@crypto-ledger/reports/sii/sii.service';

@Injectable()
export class SiiApiService {
  private siiService: SiiService;

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {
    this.siiService = new SiiService(this.prisma, {
      endpoint: this.config.get('SII_ENDPOINT') || 
        'https://prewww1.aeat.es/wlpl/SSII-FACT/ws/fe/SiiFactFEV1SOAP',
      environment: this.config.get('SII_ENVIRONMENT') as any || 'sandbox',
      nif: this.config.get('COMPANY_NIF') || 'B12345678',
    });
  }

  async submitInvoice(invoiceId: string, submissionType: 'issued' | 'received') {
    return this.siiService.submitInvoice(invoiceId, submissionType);
  }

  async getStatus(invoiceId: string) {
    return this.siiService.getSubmissionStatus(invoiceId);
  }

  async checkOverdue() {
    return this.siiService.checkSubmissionDeadlines();
  }

  async retryFailed() {
    return this.siiService.retryFailedSubmissions();
  }
}
