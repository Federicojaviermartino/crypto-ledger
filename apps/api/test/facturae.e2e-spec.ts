import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Facturae 3.2.x Generation (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let testEntity: any;

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
        code: 'ES-SELLER',
        name: 'Vendedor Test SL',
        currency: 'EUR',
        entityType: 'subsidiary',
        country: 'ES',
        taxId: 'B12345678',
      },
    });
  });

  afterAll(async () => {
    await prisma.entity.delete({ where: { id: testEntity.id } });
    await app.close();
  });

  describe('POST /invoices', () => {
    it('should create invoice', async () => {
      const response = await request(app.getHttpServer())
        .post('/invoices')
        .send({
          invoiceNumber: 'FAC-2025-001',
          series: 'A',
          issueDate: '2025-01-15',
          sellerEntityId: testEntity.id,
          buyer: {
            name: 'Cliente Test SA',
            taxId: 'A87654321',
            address: {
              street: 'Calle Cliente 123',
              city: 'Barcelona',
              postalCode: '08001',
              province: 'Barcelona',
              country: 'ESP',
            },
          },
          invoiceType: 'FC',
          direction: 'issued',
          lines: [
            {
              lineNumber: 1,
              description: 'Servicio de consultoría',
              quantity: 10,
              unitPrice: 100,
              taxRate: 21,
              taxAmount: 210,
              lineTotal: 1000,
            },
            {
              lineNumber: 2,
              description: 'Licencia software',
              quantity: 1,
              unitPrice: 500,
              taxRate: 21,
              taxAmount: 105,
              lineTotal: 500,
            },
          ],
          currency: 'EUR',
        })
        .expect(201);

      expect(response.body).toMatchObject({
        id: expect.any(String),
        invoiceNumber: 'FAC-2025-001',
        total: 1815, // 1500 + 315 tax
      });
    });
  });

  describe('POST /invoices/:id/facturae', () => {
    let testInvoiceId: string;

    beforeAll(async () => {
      const invoice = await request(app.getHttpServer())
        .post('/invoices')
        .send({
          invoiceNumber: 'FAC-2025-002',
          issueDate: '2025-01-16',
          sellerEntityId: testEntity.id,
          buyer: {
            name: 'Comprador Test',
            taxId: 'B11111111',
            address: {
              street: 'Avenida Principal 1',
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
              description: 'Producto de prueba',
              quantity: 5,
              unitPrice: 200,
              taxRate: 21,
              taxAmount: 210,
              lineTotal: 1000,
            },
          ],
        });
      
      testInvoiceId = invoice.body.id;
    });

    it('should generate valid Facturae XML', async () => {
      const response = await request(app.getHttpServer())
        .post(`/invoices/${testInvoiceId}/facturae`)
        .expect(201);

      expect(response.body).toMatchObject({
        invoiceId: testInvoiceId,
        xml: expect.any(String),
        validation: {
          valid: true,
          errors: [],
        },
      });

      // Verify XML structure
      const xml = response.body.xml;
      expect(xml).toContain('<?xml version="1.0"');
      expect(xml).toContain('<fe:Facturae');
      expect(xml).toContain('xmlns:fe="http://www.facturae.gob.es');
      expect(xml).toContain('<InvoiceNumber>FAC-2025-002</InvoiceNumber>');
      expect(xml).toContain('<SchemaVersion>3.2.2</SchemaVersion>');
    });

    it('should include seller tax identification', async () => {
      const response = await request(app.getHttpServer())
        .post(`/invoices/${testInvoiceId}/facturae`)
        .expect(201);

      const xml = response.body.xml;
      expect(xml).toContain('<TaxIdentificationNumber>B12345678</TaxIdentificationNumber>');
      expect(xml).toContain('<CorporateName>Vendedor Test SL</CorporateName>');
    });

    it('should include buyer information', async () => {
      const response = await request(app.getHttpServer())
        .post(`/invoices/${testInvoiceId}/facturae`)
        .expect(201);

      const xml = response.body.xml;
      expect(xml).toContain('<TaxIdentificationNumber>B11111111</TaxIdentificationNumber>');
      expect(xml).toContain('Comprador Test');
    });

    it('should include invoice lines', async () => {
      const response = await request(app.getHttpServer())
        .post(`/invoices/${testInvoiceId}/facturae`)
        .expect(201);

      const xml = response.body.xml;
      expect(xml).toContain('<Items>');
      expect(xml).toContain('<InvoiceLine>');
      expect(xml).toContain('<ItemDescription>Producto de prueba</ItemDescription>');
      expect(xml).toContain('<Quantity>5</Quantity>');
      expect(xml).toContain('<UnitPriceWithoutTax>200.00</UnitPriceWithoutTax>');
    });

    it('should include tax information', async () => {
      const response = await request(app.getHttpServer())
        .post(`/invoices/${testInvoiceId}/facturae`)
        .expect(201);

      const xml = response.body.xml;
      expect(xml).toContain('<TaxTypeCode>01</TaxTypeCode>'); // 01 = IVA
      expect(xml).toContain('<TaxRate>21.00</TaxRate>');
      expect(xml).toContain('<TotalTaxOutputs>210.00</TotalTaxOutputs>');
    });

    it('should include correct totals', async () => {
      const response = await request(app.getHttpServer())
        .post(`/invoices/${testInvoiceId}/facturae`)
        .expect(201);

      const xml = response.body.xml;
      expect(xml).toContain('<TotalGrossAmountBeforeTaxes>1000.00</TotalGrossAmountBeforeTaxes>');
      expect(xml).toContain('<InvoiceTotal>1210.00</InvoiceTotal>');
    });

    it('should add signature block when sign=true', async () => {
      const response = await request(app.getHttpServer())
        .post(`/invoices/${testInvoiceId}/facturae?sign=true`)
        .expect(201);

      const xml = response.body.xml;
      expect(xml).toContain('<ds:Signature');
      expect(xml).toContain('xmlns:ds="http://www.w3.org/2000/09/xmldsig#"');
    });
  });

  describe('GET /invoices/:id/facturae.xml', () => {
    let testInvoiceId: string;

    beforeAll(async () => {
      const invoice = await request(app.getHttpServer())
        .post('/invoices')
        .send({
          invoiceNumber: 'FAC-2025-003',
          issueDate: '2025-01-17',
          sellerEntityId: testEntity.id,
          buyer: {
            name: 'Cliente Download',
            taxId: 'B22222222',
            address: {
              street: 'Calle Test',
              city: 'Valencia',
              postalCode: '46001',
              province: 'Valencia',
              country: 'ESP',
            },
          },
          invoiceType: 'FC',
          direction: 'issued',
          lines: [
            {
              lineNumber: 1,
              description: 'Test product',
              quantity: 1,
              unitPrice: 100,
              taxRate: 21,
              taxAmount: 21,
              lineTotal: 100,
            },
          ],
        })
        .then(res => res.body.id);

      // Generate Facturae
      await request(app.getHttpServer())
        .post(`/invoices/${invoice}/facturae`);

      testInvoiceId = invoice;
    });

    it('should download Facturae XML', async () => {
      const response = await request(app.getHttpServer())
        .get(`/invoices/${testInvoiceId}/facturae.xml`)
        .expect(200);

      expect(response.headers['content-type']).toContain('application/xml');
      expect(response.headers['content-disposition']).toContain('attachment');
      expect(response.text).toContain('<?xml version');
      expect(response.text).toContain('<fe:Facturae');
    });
  });

  describe('Validation edge cases', () => {
    it('should reject invoice with invalid tax rate', async () => {
      const invoice = await prisma.invoice.create({
        data: {
          invoiceNumber: 'INVALID-001',
          issueDate: new Date(),
          sellerEntityId: testEntity.id,
          buyerName: 'Test Buyer',
          buyerTaxId: 'B33333333',
          buyerAddress: {},
          invoiceType: 'FC',
          direction: 'issued',
          subtotal: 100,
          taxTotal: 50, // 50% rate - invalid
          total: 150,
          currency: 'EUR',
          lines: [{
            lineNumber: 1,
            description: 'Test',
            quantity: 1,
            unitPrice: 100,
            taxRate: 50,
            taxAmount: 50,
            lineTotal: 100,
          }],
        },
      });

      const response = await request(app.getHttpServer())
        .post(`/invoices/${invoice.id}/facturae`)
        .expect(500);

      expect(response.body.message).toContain('Invalid tax rate');
    });
  });

  describe('GET /invoices', () => {
    it('should list invoices with filters', async () => {
      const response = await request(app.getHttpServer())
        .get('/invoices?direction=issued&status=draft')
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      
      if (response.body.length > 0) {
        expect(response.body[0]).toMatchObject({
          id: expect.any(String),
          invoiceNumber: expect.any(String),
          direction: 'issued',
        });
      }
    });
  });
});
