import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * E2E tests for invoices and tax compliance
 * Tests Facturae, SII, and Peppol generation
 */
describe('Invoices & Tax Compliance (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let supplierId: string;
  let customerId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );

    prisma = app.get<PrismaService>(PrismaService);
    await app.init();

    // Clean up
    await prisma.invoice.deleteMany({});
    await prisma.party.deleteMany({});

    // Create test parties
    const supplier = await prisma.party.create({
      data: {
        taxId: 'B12345678',
        name: 'Test Supplier S.L.',
        address: 'Calle Mayor 1',
        city: 'Madrid',
        postalCode: '28001',
        country: 'ES',
        email: 'supplier@test.com',
        isSupplier: true,
      },
    });

    const customer = await prisma.party.create({
      data: {
        taxId: 'B87654321',
        name: 'Test Customer S.A.',
        address: 'Avenida Diagonal 100',
        city: 'Barcelona',
        postalCode: '08001',
        country: 'ES',
        email: 'customer@test.com',
        isCustomer: true,
      },
    });

    supplierId = supplier.id;
    customerId = customer.id;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /parties', () => {
    it('should create a new party', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/parties')
        .send({
          taxId: 'B99999999',
          name: 'New Party Ltd',
          address: 'Street 123',
          city: 'Valencia',
          postalCode: '46001',
          country: 'ES',
          isCustomer: true,
        })
        .expect(201);

      expect(response.body).toMatchObject({
        id: expect.any(String),
        taxId: 'B99999999',
        name: 'New Party Ltd',
        isCustomer: true,
      });
    });

    it('should reject duplicate tax ID', async () => {
      await request(app.getHttpServer())
        .post('/api/parties')
        .send({
          taxId: 'B12345678', // Already exists
          name: 'Duplicate',
          country: 'ES',
        })
        .expect(409); // Conflict
    });
  });

  describe('GET /parties', () => {
    it('should list all parties', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/parties')
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThanOrEqual(2);
    });

    it('should filter by type (customers)', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/parties?type=customer')
        .expect(200);

      expect(response.body.every((p: any) => p.isCustomer)).toBe(true);
    });

    it('should filter by type (suppliers)', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/parties?type=supplier')
        .expect(200);

      expect(response.body.every((p: any) => p.isSupplier)).toBe(true);
    });
  });

  describe('POST /invoices', () => {
    it('should create a new invoice', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/invoices')
        .send({
          invoiceNumber: 'INV-2025-001',
          invoiceDate: '2025-01-15',
          invoiceType: '380',
          direction: 'issued',
          supplierId,
          customerId,
          lines: [
            {
              description: 'Consulting services',
              quantity: 10,
              unitPrice: 100,
              taxRate: 21,
            },
            {
              description: 'Software license',
              quantity: 1,
              unitPrice: 500,
              discount: 10,
              taxRate: 21,
            },
          ],
          currency: 'EUR',
          dueDate: '2025-02-15',
        })
        .expect(201);

      expect(response.body).toMatchObject({
        id: expect.any(String),
        invoiceNumber: 'INV-2025-001',
        subtotal: 1450, // (10*100) + (1*500*0.9)
        taxAmount: 304.5, // 1450 * 0.21
        total: 1754.5,
        currency: 'EUR',
      });

      expect(response.body.lines).toHaveLength(2);
    });

    it('should calculate line totals correctly', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/invoices')
        .send({
          invoiceNumber: 'INV-2025-002',
          invoiceDate: '2025-01-16',
          invoiceType: '380',
          direction: 'issued',
          supplierId,
          customerId,
          lines: [
            {
              description: 'Product A',
              quantity: 5,
              unitPrice: 20,
              discount: 0,
              taxRate: 21,
            },
          ],
        })
        .expect(201);

      const line = response.body.lines[0];
      expect(line.subtotal).toBe(100); // 5 * 20
      expect(line.taxAmount).toBe(21); // 100 * 0.21
      expect(line.total).toBe(121);
    });
  });

  describe('POST /invoices/:id/facturae', () => {
    let invoiceId: string;

    beforeEach(async () => {
      const invoice = await prisma.invoice.create({
        data: {
          invoiceNumber: 'FACT-2025-001',
          invoiceDate: new Date('2025-01-15'),
          invoiceType: '380',
          direction: 'issued',
          supplierId,
          customerId,
          subtotal: 1000,
          taxAmount: 210,
          total: 1210,
          currency: 'EUR',
          lines: {
            create: [
              {
                lineNumber: 1,
                description: 'Service',
                quantity: 1,
                unitPrice: 1000,
                discount: 0,
                subtotal: 1000,
                taxRate: 21,
                taxAmount: 210,
                total: 1210,
              },
            ],
          },
        },
      });

      invoiceId = invoice.id;
    });

    it('should generate Facturae XML', async () => {
      const response = await request(app.getHttpServer())
        .post(`/api/invoices/${invoiceId}/facturae`)
        .send({ sign: false })
        .expect(201);

      expect(response.body).toMatchObject({
        xml: expect.stringContaining('<?xml'),
        signature: null,
      });

      expect(response.body.xml).toContain('Facturae');
      expect(response.body.xml).toContain('FACT-2025-001');
      expect(response.body.xml).toContain('B12345678'); // Supplier tax ID
      expect(response.body.xml).toContain('1210.00'); // Total
    });

    it('should include signature placeholder when requested', async () => {
      const response = await request(app.getHttpServer())
        .post(`/api/invoices/${invoiceId}/facturae`)
        .send({ sign: true })
        .expect(201);

      expect(response.body.signature).toBeDefined();
      expect(response.body.signature).toContain('ds:Signature');
    });

    it('should store Facturae XML in database', async () => {
      await request(app.getHttpServer())
        .post(`/api/invoices/${invoiceId}/facturae`)
        .send({})
        .expect(201);

      const invoice = await prisma.invoice.findUnique({
        where: { id: invoiceId },
      });

      expect(invoice?.facturaeXml).toBeDefined();
      expect(invoice?.facturaeFiled).toBe(true);
    });
  });

  describe('GET /invoices/:id/facturae.xml', () => {
    let invoiceId: string;

    beforeEach(async () => {
      const invoice = await prisma.invoice.create({
        data: {
          invoiceNumber: 'DL-001',
          invoiceDate: new Date('2025-01-15'),
          invoiceType: '380',
          direction: 'issued',
          supplierId,
          customerId,
          subtotal: 100,
          taxAmount: 21,
          total: 121,
          currency: 'EUR',
          facturaeXml: '<?xml version="1.0"?><Facturae></Facturae>',
          facturaeFiled: true,
          lines: {
            create: [
              {
                lineNumber: 1,
                description: 'Test',
                quantity: 1,
                unitPrice: 100,
                discount: 0,
                subtotal: 100,
                taxRate: 21,
                taxAmount: 21,
                total: 121,
              },
            ],
          },
        },
      });

      invoiceId = invoice.id;
    });

    it('should download Facturae XML', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/invoices/${invoiceId}/facturae.xml`)
        .expect(200);

      expect(response.header['content-type']).toContain('xml');
      expect(response.header['content-disposition']).toContain('facturae_DL-001.xml');
      expect(response.text).toContain('<?xml');
    });

    it('should fail if XML not generated', async () => {
      const invoice = await prisma.invoice.create({
        data: {
          invoiceNumber: 'NO-XML',
          invoiceDate: new Date(),
          invoiceType: '380',
          direction: 'issued',
          supplierId,
          customerId,
          subtotal: 100,
          taxAmount: 21,
          total: 121,
          lines: {
            create: [{
              lineNumber: 1,
              description: 'Test',
              quantity: 1,
              unitPrice: 100,
              discount: 0,
              subtotal: 100,
              taxRate: 21,
              taxAmount: 21,
              total: 121,
            }],
          },
        },
      });

      await request(app.getHttpServer())
        .get(`/api/invoices/${invoice.id}/facturae.xml`)
        .expect(500);
    });
  });

  describe('POST /invoices/:id/peppol', () => {
    let invoiceId: string;

    beforeEach(async () => {
      const invoice = await prisma.invoice.create({
        data: {
          invoiceNumber: 'PEP-001',
          invoiceDate: new Date('2025-01-15'),
          invoiceType: '380',
          direction: 'issued',
          supplierId,
          customerId,
          subtotal: 500,
          taxAmount: 105,
          total: 605,
          currency: 'EUR',
          lines: {
            create: [
              {
                lineNumber: 1,
                description: 'EU Service',
                quantity: 1,
                unitPrice: 500,
                discount: 0,
                subtotal: 500,
                taxRate: 21,
                taxAmount: 105,
                total: 605,
              },
            ],
          },
        },
      });

      invoiceId = invoice.id;
    });

    it('should generate Peppol UBL XML', async () => {
      const response = await request(app.getHttpServer())
        .post(`/api/invoices/${invoiceId}/peppol`)
        .expect(201);

      expect(response.body).toMatchObject({
        ubl: expect.stringContaining('<?xml'),
        validation: expect.objectContaining({
          isValid: expect.any(Boolean),
          errors: expect.any(Array),
          warnings: expect.any(Array),
        }),
      });

      expect(response.body.ubl).toContain('Invoice');
      expect(response.body.ubl).toContain('urn:fdc:peppol.eu');
      expect(response.body.ubl).toContain('PEP-001');
    });

    it('should validate UBL structure', async () => {
      const response = await request(app.getHttpServer())
        .post(`/api/invoices/${invoiceId}/peppol`)
        .expect(201);

      const { validation } = response.body;

      expect(validation.isValid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('should include Peppol participant IDs', async () => {
      const response = await request(app.getHttpServer())
        .post(`/api/invoices/${invoiceId}/peppol`)
        .expect(201);

      expect(response.body.ubl).toContain('0088:ESB12345678');
      expect(response.body.ubl).toContain('0088:ESB87654321');
    });
  });

  describe('GET /invoices/:id/peppol.xml', () => {
    let invoiceId: string;

    beforeEach(async () => {
      const invoice = await prisma.invoice.create({
        data: {
          invoiceNumber: 'UBL-001',
          invoiceDate: new Date('2025-01-15'),
          invoiceType: '380',
          direction: 'issued',
          supplierId,
          customerId,
          subtotal: 200,
          taxAmount: 42,
          total: 242,
          currency: 'EUR',
          ublXml: '<?xml version="1.0"?><Invoice></Invoice>',
          ublValidated: true,
          lines: {
            create: [{
              lineNumber: 1,
              description: 'Test',
              quantity: 1,
              unitPrice: 200,
              discount: 0,
              subtotal: 200,
              taxRate: 21,
              taxAmount: 42,
              total: 242,
            }],
          },
        },
      });

      invoiceId = invoice.id;
    });

    it('should download Peppol UBL XML', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/invoices/${invoiceId}/peppol.xml`)
        .expect(200);

      expect(response.header['content-type']).toContain('xml');
      expect(response.header['content-disposition']).toContain('peppol_UBL-001.xml');
      expect(response.text).toContain('<?xml');
    });
  });

  describe('GET /invoices', () => {
    beforeEach(async () => {
      await prisma.invoice.deleteMany({});

      await prisma.invoice.createMany({
        data: [
          {
            invoiceNumber: 'F1',
            invoiceDate: new Date('2025-01-01'),
            invoiceType: '380',
            direction: 'issued',
            supplierId,
            customerId,
            subtotal: 100,
            taxAmount: 21,
            total: 121,
            siiStatus: 'accepted',
          },
          {
            invoiceNumber: 'F2',
            invoiceDate: new Date('2025-01-02'),
            invoiceType: '381',
            direction: 'received',
            supplierId: customerId,
            customerId: supplierId,
            subtotal: 200,
            taxAmount: 42,
            total: 242,
            siiStatus: 'pending',
          },
        ],
      });
    });

    it('should list all invoices', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/invoices')
        .expect(200);

      expect(response.body).toMatchObject({
        invoices: expect.any(Array),
        pagination: expect.objectContaining({
          total: 2,
        }),
      });
    });

    it('should filter by direction', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/invoices?direction=issued')
        .expect(200);

      expect(response.body.invoices).toHaveLength(1);
      expect(response.body.invoices[0].direction).toBe('issued');
    });

    it('should filter by SII status', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/invoices?siiStatus=accepted')
        .expect(200);

      expect(response.body.invoices).toHaveLength(1);
      expect(response.body.invoices[0].siiStatus).toBe('accepted');
    });

    it('should paginate results', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/invoices?skip=0&take=1')
        .expect(200);

      expect(response.body.invoices).toHaveLength(1);
      expect(response.body.pagination.take).toBe(1);
    });
  });

  describe('Integration: Full Invoice Workflow', () => {
    it('should create invoice, generate Facturae and Peppol', async () => {
      // 1. Create invoice
      const createResponse = await request(app.getHttpServer())
        .post('/api/invoices')
        .send({
          invoiceNumber: 'FULL-001',
          invoiceDate: '2025-01-20',
          invoiceType: '380',
          direction: 'issued',
          supplierId,
          customerId,
          lines: [
            {
              description: 'Complete service',
              quantity: 2,
              unitPrice: 250,
              taxRate: 21,
            },
          ],
        })
        .expect(201);

      const invoiceId = createResponse.body.id;

      // 2. Generate Facturae
      const facturaeResponse = await request(app.getHttpServer())
        .post(`/api/invoices/${invoiceId}/facturae`)
        .send({ sign: true })
        .expect(201);

      expect(facturaeResponse.body.xml).toContain('Facturae');
      expect(facturaeResponse.body.signature).toBeDefined();

      // 3. Generate Peppol
      const peppolResponse = await request(app.getHttpServer())
        .post(`/api/invoices/${invoiceId}/peppol`)
        .expect(201);

      expect(peppolResponse.body.validation.isValid).toBe(true);

      // 4. Verify invoice has both XMLs
      const invoice = await prisma.invoice.findUnique({
        where: { id: invoiceId },
      });

      expect(invoice?.facturaeXml).toBeDefined();
      expect(invoice?.ublXml).toBeDefined();
      expect(invoice?.facturaeFiled).toBe(true);
      expect(invoice?.ublValidated).toBe(true);
    });
  });
});
