import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * E2E tests for consolidation
 * Tests multi-entity consolidation and FX translation
 */
describe('Consolidation (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let usEntity: any;
  let euEntity: any;
  let cashAccount: any;
  let revenueAccount: any;

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
    await prisma.journalEntry.deleteMany({});
    await prisma.account.deleteMany({});
    await prisma.entity.deleteMany({});

    // Create test entities
    usEntity = await prisma.entity.create({
      data: {
        code: 'US-TEST',
        name: 'US Test Entity',
        currency: 'USD',
        entityType: 'parent',
        country: 'US',
      },
    });

    euEntity = await prisma.entity.create({
      data: {
        code: 'EU-TEST',
        name: 'EU Test Entity',
        currency: 'EUR',
        entityType: 'subsidiary',
        country: 'DE',
        parentEntityId: usEntity.id,
      },
    });

    // Create accounts
    cashAccount = await prisma.account.create({
      data: {
        code: '1000-US',
        name: 'Cash USD',
        type: 'asset',
        entityId: usEntity.id,
      },
    });

    await prisma.account.create({
      data: {
        code: '1000-EU',
        name: 'Cash EUR',
        type: 'asset',
        entityId: euEntity.id,
      },
    });

    revenueAccount = await prisma.account.create({
      data: {
        code: '4000-US',
        name: 'Revenue USD',
        type: 'revenue',
        entityId: usEntity.id,
      },
    });

    await prisma.account.create({
      data: {
        code: '4000-EU',
        name: 'Revenue EUR',
        type: 'revenue',
        entityId: euEntity.id,
      },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /entities', () => {
    it('should create a new entity', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/entities')
        .send({
          code: 'UK-TEST',
          name: 'UK Test Entity',
          currency: 'GBP',
          entityType: 'branch',
          country: 'GB',
        })
        .expect(201);

      expect(response.body).toMatchObject({
        id: expect.any(String),
        code: 'UK-TEST',
        currency: 'GBP',
      });
    });
  });

  describe('POST /consolidations/run', () => {
    beforeEach(async () => {
      // Create entries for each entity
      // US: $100,000 revenue
      await prisma.journalEntry.create({
        data: {
          date: new Date('2025-01-15'),
          description: 'US Revenue',
          hash: 'hash1',
          postings: {
            create: [
              { accountId: cashAccount.id, debit: 100000, credit: 0 },
              { accountId: revenueAccount.id, debit: 0, credit: 100000 },
            ],
          },
        },
      });

      // EU: €50,000 revenue (would be ~$54,500 at 1.09 rate)
      const euCash = await prisma.account.findFirst({
        where: { code: '1000-EU' },
      });

      const euRevenue = await prisma.account.findFirst({
        where: { code: '4000-EU' },
      });

      await prisma.journalEntry.create({
        data: {
          date: new Date('2025-01-15'),
          description: 'EU Revenue',
          hash: 'hash2',
          prevHash: 'hash1',
          postings: {
            create: [
              { accountId: euCash!.id, debit: 50000, credit: 0 },
              { accountId: euRevenue!.id, debit: 0, credit: 50000 },
            ],
          },
        },
      });
    });

    afterEach(async () => {
      await prisma.journalEntry.deleteMany({});
    });

    it('should run consolidation with FX translation', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/consolidations/run')
        .send({
          period: '2025-01',
          reportingCurrency: 'USD',
          asOfDate: '2025-01-31',
        })
        .expect(201);

      expect(response.body).toMatchObject({
        id: expect.any(String),
        period: '2025-01',
        reportingCurrency: 'USD',
        trialBalance: expect.any(Array),
        entities: 2,
      });

      // Check FX translation occurred
      const revenue = response.body.trialBalance.find(
        (acc: any) => acc.accountType === 'revenue'
      );

      expect(revenue).toBeDefined();
      expect(revenue.balance).toBeGreaterThan(100000); // Should include translated EU revenue
    }, 15000); // Allow time for FX API call
  });

  describe('GET /consolidations/fx-rates', () => {
    it('should fetch FX rate from ECB', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/consolidations/fx-rates?from=EUR&to=USD&date=2025-01-15')
        .expect(200);

      expect(response.body).toMatchObject({
        from: 'EUR',
        to: 'USD',
        date: expect.any(String),
        rate: expect.any(Number),
      });

      expect(response.body.rate).toBeGreaterThan(0);
    }, 10000);

    it('should return 1.0 for same currency', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/consolidations/fx-rates?from=USD&to=USD&date=2025-01-15')
        .expect(200);

      expect(response.body.rate).toBe(1.0);
    });
  });

  describe('POST /consolidations/fx-rates', () => {
    it('should store manual FX rate', async () => {
      await request(app.getHttpServer())
        .post('/api/consolidations/fx-rates')
        .send({
          fromCurrency: 'GBP',
          toCurrency: 'USD',
          date: '2025-01-15',
          rate: 1.27,
        })
        .expect(201);

      // Verify stored
      const stored = await prisma.exchangeRate.findUnique({
        where: {
          fromCurrency_toCurrency_date: {
            fromCurrency: 'GBP',
            toCurrency: 'USD',
            date: new Date('2025-01-15'),
          },
        },
      });

      expect(stored).toBeDefined();
      expect(stored?.rate).toBe(1.27);
      expect(stored?.source).toBe('manual');
    });
  });
});
