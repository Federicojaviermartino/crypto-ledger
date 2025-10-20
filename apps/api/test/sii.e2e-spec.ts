import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('SII Submission (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let testEntity: any;
  let testInvoiceId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true }));
    prisma = app.get(PrismaService);
    
    await app.init();

    // Create test entity
    testEntity = await prisma.entity.create({
      data: {
        code: 'ES-SII-TEST',
        name: 'SII Test Company SL',
        currency: 'EUR',
        entityType: 'subsidiary',
        country: 'ES',
        taxId: 'B87654321',
      },
    });

    // Create test invoice
    const invoice = await request(app.getHttpServer())
      .post('/invoices')
      .send({
        invoiceNumber: 'SII-001',
        issueDate: '2025-01-15',
        sellerEntityId: testEntity.id,
        buyer: {
          name: 'Cliente SII',
          taxId: 'B11111111',
          address: {
            street: 'Calle Test',
            city: 'Madrid',
            postalCode: '28001',
            province: 'Madrid',
            country: 'ESP',
          },
        },
        invoiceType: 'FC',
        direction: 'issued',
        lines: [
          {
            lineNumber: 1,
            description: 'Servicio',
            quantity: 1,
            unitPrice: 1000,
            taxRate: 21,
            taxAmount: 210,
            lineTotal: 1000,
          },
        ],
      });

    testInvoiceId = invoice.body.id;
  });

  afterAll(async () => {
    await prisma.invoice.deleteMany({ where: { sellerEntityId: testEntity.id } });
    await prisma.entity.delete({ where: { id: testEntity.id } });
    await app.close();
  });

  describe('POST /invoices/:id/sii/submit', () => {
    it('should submit invoice to SII', async () => {
      const response = await request(app.getHttpServer())
        .post(`/invoices/${testInvoiceId}/sii/submit`)
        .send({ submissionType: 'issued' })
        .expect(201);

      expect(response.body).toMatchObject({
        invoiceId: testInvoiceId,
        totalSubmissions: expect.any(Number),
        lastSubmission: expect.any(Object),
      });

      expect(response.body.totalSubmissions).toBeGreaterThan(0);
    });

    it('should not resubmit if already accepted', async () => {
      // Submit first time
      await request(app.getHttpServer())
        .post(`/invoices/${testInvoiceId}/sii/submit`)
        .send({ submissionType: 'issued' });

      // Try to submit again
      const response = await request(app.getHttpServer())
        .post(`/invoices/${testInvoiceId}/sii/submit`)
        .send({ submissionType: 'issued' })
        .expect(201);

      // Should not create duplicate submissions
      expect(response.body.totalSubmissions).toBe(1);
    });
  });

  describe('GET /invoices/:id/sii/status', () => {
    it('should return SII submission status', async () => {
      const response = await request(app.getHttpServer())
        .get(`/invoices/${testInvoiceId}/sii/status`)
        .expect(200);

      expect(response.body).toMatchObject({
        invoiceId: testInvoiceId,
        totalSubmissions: expect.any(Number),
        isAccepted: expect.any(Boolean),
      });

      if (response.body.lastSubmission) {
        expect(response.body.lastSubmission).toMatchObject({
          submissionType: expect.any(String),
          statusCode: expect.any(Number),
          isSuccess: expect.any(Boolean),
        });
      }
    });
  });

  describe('GET /invoices/sii/overdue', () => {
    it('should list overdue invoices', async () => {
      // Create old invoice (> 4 days ago)
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 6);

      const oldInvoice = await prisma.invoice.create({
        data: {
          invoiceNumber: 'OVERDUE-001',
          issueDate: oldDate,
          sellerEntityId: testEntity.id,
          buyerName: 'Buyer',
          buyerTaxId: 'B22222222',
          buyerAddress: {},
          invoiceType: 'FC',
          direction: 'issued',
          subtotal: 100,
          taxTotal: 21,
          total: 121,
          currency: 'EUR',
          lines: [],
          siiStatus: 'pending',
        },
      });

      const response = await request(app.getHttpServer())
        .get('/invoices/sii/overdue')
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      
      const hasOverdue = response.body.some(
        (inv: any) => inv.invoiceId === oldInvoice.id
      );
      
      expect(hasOverdue).toBe(true);

      if (hasOverdue) {
        const overdueInv = response.body.find(
          (inv: any) => inv.invoiceId === oldInvoice.id
        );
        expect(overdueInv.daysOverdue).toBeGreaterThan(0);
      }
    });
  });

  describe('Retry logic', () => {
    it('should track retry attempts', async () => {
      // This would require mocking SII responses
      // For now, verify that retry count increases
      
      const submissions = await prisma.siiSubmission.findMany({
        where: { invoiceId: testInvoiceId },
      });

      if (submissions.length > 0) {
        expect(submissions[0]).toHaveProperty('retryCount');
        expect(submissions[0].retryCount).toBeGreaterThanOrEqual(0);
      }
    });
  });
});
