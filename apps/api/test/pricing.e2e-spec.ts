import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * E2E tests for pricing service
 * Tests price fetching and caching
 */
describe('Pricing (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

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
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(async () => {
    await prisma.price.deleteMany({});
  });

  describe('GET /pricing/current/:asset/:quote', () => {
    it('should fetch current price from API', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/pricing/current/BTC/USD')
        .expect(200);

      expect(response.body).toMatchObject({
        asset: 'BTC',
        quote: 'USD',
        price: expect.any(Number),
        timestamp: expect.any(String),
      });

      expect(response.body.price).toBeGreaterThan(0);
    }, 10000); // Longer timeout for API call

    it('should cache price in database', async () => {
      await request(app.getHttpServer())
        .get('/api/pricing/current/ETH/USD')
        .expect(200);

      const stored = await prisma.price.findFirst({
        where: {
          asset: 'ETH',
          quote: 'USD',
        },
        orderBy: { timestamp: 'desc' },
      });

      expect(stored).toBeDefined();
      expect(stored?.value).toBeGreaterThan(0);
    }, 10000);
  });

  describe('GET /pricing/historical/:asset/:quote', () => {
    it('should fetch historical price', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/pricing/historical/BTC/USD?date=2024-01-01')
        .expect(200);

      expect(response.body).toMatchObject({
        asset: 'BTC',
        quote: 'USD',
        date: '2024-01-01',
        price: expect.any(Number),
      });
    }, 10000);

    it('should require date parameter', async () => {
      await request(app.getHttpServer())
        .get('/api/pricing/historical/BTC/USD')
        .expect(500); // Error: date required
    });

    it('should use cached historical price', async () => {
      // First call - cache miss
      const first = await request(app.getHttpServer())
        .get('/api/pricing/historical/ETH/USD?date=2024-01-15')
        .expect(200);

      // Second call - cache hit
      const second = await request(app.getHttpServer())
        .get('/api/pricing/historical/ETH/USD?date=2024-01-15')
        .expect(200);

      expect(first.body.price).toBe(second.body.price);
    }, 15000);
  });

  describe('POST /pricing/backfill/:asset/:quote', () => {
    it('should backfill prices for date range', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/pricing/backfill/BTC/USD?days=7')
        .expect(201);

      expect(response.body).toMatchObject({
        asset: 'BTC',
        quote: 'USD',
        filled: expect.any(Number),
        startDate: expect.any(String),
        endDate: expect.any(String),
      });

      expect(response.body.filled).toBeGreaterThan(0);

      // Verify prices were stored
      const count = await prisma.price.count({
        where: {
          asset: 'BTC',
          quote: 'USD',
        },
      });

      expect(count).toBeGreaterThanOrEqual(response.body.filled);
    }, 60000); // Long timeout for multiple API calls
  });
});
