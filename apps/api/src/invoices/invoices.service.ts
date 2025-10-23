import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FacturaeGenerator } from '@crypto-ledger/reports/facturae/facturae-generator';
import { SiiService } from '@crypto-ledger/reports/sii/sii.service';
import { PeppolGenerator } from '@crypto-ledger/reports/peppol/peppol-generator';

@Injectable()
export class InvoicesService {
  private facturaeGenerator: FacturaeGenerator;
  private siiService: SiiService;
  private peppolGenerator: PeppolGenerator;

  constructor(private prisma: PrismaService) {
    this.facturaeGenerator = new FacturaeGenerator();
    this.peppolGenerator = new PeppolGenerator();
    
    // Initialize SII service
    this.siiService = new SiiService(prisma, {
      endpoint: process.env.SII_ENDPOINT || 'https://prewww1.aeat.es/wlpl/SSII-FACT/ws/fe/SiiFactFEV1SOAP',
      environment: (process.env.SII_ENVIRONMENT as any) || 'sandbox',
      nif: process.env.COMPANY_NIF || 'B12345678',
    });
  }

  /**
   * Create a new invoice
   */
  async create(data: {
    invoiceNumber: string;
    invoiceDate: Date;
    invoiceType: string;
    direction: string;
    supplierId: string;
    customerId: string;
    lines: Array<{
      description: string;
      quantity: number;
      unitPrice: number;
      discount?: number;
      taxRate: number;
    }>;
    currency?: string;
    dueDate?: Date;
  }) {
    // Calculate totals
    const lines = data.lines.map((line, index) => {
      const discount = line.discount || 0;
      const subtotal = line.quantity * line.unitPrice * (1 - discount / 100);
      const taxAmount = subtotal * (line.taxRate / 100);
      const total = subtotal + taxAmount;

      return {
        lineNumber: index + 1,
        description: line.description,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        discount,
        subtotal,
        taxRate: line.taxRate,
        taxAmount,
        total,
      };
    });

    const subtotal = lines.reduce((sum, line) => sum + line.subtotal, 0);
    const taxAmount = lines.reduce((sum, line) => sum + line.taxAmount, 0);
    const total = subtotal + taxAmount;

    return this.prisma.invoice.create({
      data: {
        invoiceNumber: data.invoiceNumber,
        invoiceDate: data.invoiceDate,
        invoiceType: data.invoiceType,
        direction: data.direction,
        supplierId: data.supplierId,
        customerId: data.customerId,
        subtotal,
        taxAmount,
        total,
        currency: data.currency || 'EUR',
        dueDate: data.dueDate,
        lines: {
          create: lines,
        },
      },
      include: {
        lines: true,
        supplier: true,
        customer: true,
      },
    });
  }

  /**
   * Get invoice by ID
   */
  async findOne(id: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      include: {
        lines: true,
        supplier: true,
        customer: true,
      },
    });

    if (!invoice) {
      throw new NotFoundException(`Invoice ${id} not found`);
    }

    return invoice;
  }

  /**
   * Generate Facturae XML for invoice
   */
  async generateFacturae(invoiceId: string, sign: boolean = false) {
    const invoice = await this.findOne(invoiceId);

    const xml = this.facturaeGenerator.generateXML({
      invoiceNumber: invoice.invoiceNumber,
      invoiceDate: invoice.invoiceDate,
      invoiceType: invoice.invoiceType,
      supplier: {
        taxId: invoice.supplier.taxId,
        name: invoice.supplier.name,
        address: invoice.supplier.address || '',
        city: invoice.supplier.city || '',
        postalCode: invoice.supplier.postalCode || '',
        country: invoice.supplier.country,
      },
      customer: {
        taxId: invoice.customer.taxId,
        name: invoice.customer.name,
        address: invoice.customer.address || '',
        city: invoice.customer.city || '',
        postalCode: invoice.customer.postalCode || '',
        country: invoice.customer.country,
      },
      lines: invoice.lines.map(line => ({
        description: line.description,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        discount: line.discount,
        taxRate: line.taxRate,
        subtotal: line.subtotal,
        taxAmount: line.taxAmount,
        total: line.total,
      })),
      subtotal: invoice.subtotal,
      taxAmount: invoice.taxAmount,
      total: invoice.total,
      currency: invoice.currency,
    });

    let signature = null;
    if (sign) {
      signature = this.facturaeGenerator.generateSignaturePlaceholder();
    }

    // Store XML
    await this.prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        facturaeXml: xml,
        facturaeSignature: signature,
        facturaeFiled: true,
      },
    });

    return { xml, signature };
  }

  /**
   * Generate Peppol UBL for invoice
   */
  async generatePeppol(invoiceId: string) {
    const invoice = await this.findOne(invoiceId);

    const ubl = this.peppolGenerator.generateUBL({
      invoiceNumber: invoice.invoiceNumber,
      invoiceDate: invoice.invoiceDate,
      invoiceType: invoice.invoiceType,
      supplier: {
        name: invoice.supplier.name,
        taxId: invoice.supplier.taxId,
        address: invoice.supplier.address || '',
        city: invoice.supplier.city || '',
        postalCode: invoice.supplier.postalCode || '',
        country: invoice.supplier.country,
        peppolId: this.peppolGenerator.generatePeppolId(
          invoice.supplier.country,
          invoice.supplier.taxId
        ),
      },
      customer: {
        name: invoice.customer.name,
        taxId: invoice.customer.taxId,
        address: invoice.customer.address || '',
        city: invoice.customer.city || '',
        postalCode: invoice.customer.postalCode || '',
        country: invoice.customer.country,
        peppolId: this.peppolGenerator.generatePeppolId(
          invoice.customer.country,
          invoice.customer.taxId
        ),
      },
      lines: invoice.lines.map(line => ({
        description: line.description,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        taxRate: line.taxRate,
        subtotal: line.subtotal,
        taxAmount: line.taxAmount,
        total: line.total,
      })),
      subtotal: invoice.subtotal,
      taxAmount: invoice.taxAmount,
      total: invoice.total,
      currency: invoice.currency,
      dueDate: invoice.dueDate || undefined,
    });

    // Validate UBL
    const validation = this.peppolGenerator.validateUBL(ubl);

    // Store UBL
    await this.prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        ublXml: ubl,
        ublValidated: validation.isValid,
      },
    });

    return {
      ubl,
      validation,
    };
  }

  /**
   * List invoices
   */
  async findAll(params: {
    direction?: string;
    siiStatus?: string;
    skip?: number;
    take?: number;
  }) {
    const where: any = {};
    if (params.direction) where.direction = params.direction;
    if (params.siiStatus) where.siiStatus = params.siiStatus;

    const [invoices, total] = await Promise.all([
      this.prisma.invoice.findMany({
        where,
        skip: params.skip || 0,
        take: params.take || 50,
        orderBy: { invoiceDate: 'desc' },
        include: {
          supplier: true,
          customer: true,
        },
      }),
      this.prisma.invoice.count({ where }),
    ]);

    return {
      invoices,
      pagination: {
        total,
        skip: params.skip || 0,
        take: params.take || 50,
      },
    };
  }

  /**
   * Submit invoice to SII
   */
  async submitToSii(invoiceId: string, submissionType: 'issued' | 'received' = 'issued') {
    return this.siiService.submitInvoice(invoiceId, submissionType);
  }

  /**
   * Get SII submission status
   */
  async getSiiStatus(invoiceId: string) {
    return this.siiService.getSubmissionStatus(invoiceId);
  }

  /**
   * Check overdue submissions
   */
  async checkOverdueSubmissions() {
    return this.siiService.checkSubmissionDeadlines();
  }
}
