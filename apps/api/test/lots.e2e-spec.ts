import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Lots (e2e)', () => {
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
    await prisma.lotDisposal.deleteMany({});
    await prisma.lot.deleteMany({});
  });

  describe('POST /lots', () => {
    it('should create a new lot', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/lots')
        .send({
          asset: 'ETH',
          quantity: 1.5,
          costBasis: 3000,
          acquiredAt: '2024-01-15T10:00:00Z',
          acquiredFrom: 'purchase',
        })
        .expect(201);

      expect(response.body).toMatchObject({
        id: expect.any(String),
        asset: 'ETH',
        quantity: 1.5,
        costBasis: 3000,
        costPerUnit: 2000, // 3000 / 1.5
        remainingQty: 1.5,
        disposed: false,
      });
    });

    it('should calculate cost per unit correctly', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/lots')
        .send({
          asset: 'BTC',
          quantity: 0.5,
          costBasis: 20000,
          acquiredAt: '2024-01-15',
        })
        .expect(201);

      expect(response.body.costPerUnit).toBe(40000);
    });
  });

  describe('POST /lots/dispose', () => {
    beforeEach(async () => {
      // Create test lots
      await prisma.lot.createMany({
        data: [
          {
            asset: 'ETH',
            quantity: 1.0,
            costBasis: 2000,
            costPerUnit: 2000,
            acquiredAt: new Date('2024-01-01'),
            acquiredFrom: 'purchase',
            remainingQty: 1.0,
            disposed: false,
          },
          {
            asset: 'ETH',
            quantity: 1.0,
            costBasis: 2400,
            costPerUnit: 2400,
            acquiredAt: new Date('2024-01-15'),
            acquiredFrom: 'purchase',
            remainingQty: 1.0,
            disposed: false,
          },
        ],
      });
    });

    it('should dispose lots using FIFO', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/lots/dispose')
        .send({
          asset: 'ETH',
          quantity: 1.5,
          proceeds: 4500, // Selling at $3000/ETH
          disposedAt: '2024-02-01',
        })
        .expect(201);

      expect(response.body).toMatchObject({
        disposals: expect.arrayContaining([
          expect.objectContaining({
            quantityDisposed: 1.0,
            totalCostBasis: 2000,
            totalProceeds: 3000,
            realizedPnL: 1000, // 3000 - 2000
          }),
          expect.objectContaining({
            quantityDisposed: 0.5,
            totalCostBasis: 1200,
            totalProceeds: 1500,
            realizedPnL: 300, // 1500 - 1200
          }),
        ]),
        totalCostBasis: 3200,
        totalProceeds: 4500,
        totalRealizedPnL: 1300, // 4500 - 3200
      });
    });

    it('should update lot remaining quantities', async () => {
      await request(app.getHttpServer())
        .post('/api/lots/dispose')
        .send({
          asset: 'ETH',
          quantity: 1.0,
          proceeds: 3000,
          disposedAt: '2024-02-01',
        })
        .expect(201);

      const lots = await prisma.lot.findMany({
        where: { asset: 'ETH' },
        orderBy: { acquiredAt: 'asc' },
      });

      expect(lots[0].remainingQty).toBe(0);
      expect(lots[0].disposed).toBe(true);
      expect(lots[1].remainingQty).toBe(1.0);
      expect(lots[1].disposed).toBe(false);
    });

    it('should fail if insufficient lots', async () => {
      await request(app.getHttpServer())
        .post('/api/lots/dispose')
        .send({
          asset: 'ETH',
          quantity: 5.0, // More than available
          proceeds: 15000,
          disposedAt: '2024-02-01',
        })
        .expect(400);
    });
  });

  describe('GET /lots/balances/:asset', () => {
    beforeEach(async () => {
      await prisma.lot.createMany({
        data: [
          {
            asset: 'BTC',
            quantity: 0.5,
            costBasis: 20000,
            costPerUnit: 40000,
            acquiredAt: new Date('2024-01-01'),
            remainingQty: 0.3,
            disposed: false,
          },
          {
            asset: 'BTC',
            quantity: 0.2,
            costBasis: 9000,
            costPerUnit: 45000,
            acquiredAt: new Date('2024-01-15'),
            remainingQty: 0.2,
            disposed: false,
          },
        ],
      });
    });

    it('should get lot balances for asset', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/lots/balances/BTC')
        .expect(200);

      expect(response.body).toMatchObject({
        totalQuantity: 0.5, // 0.3 + 0.2
        totalCostBasis: expect.any(Number),
        averageCostBasis: expect.any(Number),
        lots: expect.arrayContaining([
          expect.objectContaining({
            quantity: 0.3,
            costPerUnit: 40000,
          }),
          expect.objectContaining({
            quantity: 0.2,
            costPerUnit: 45000,
          }),
        ]),
      });

      expect(response.body.totalCostBasis).toBeCloseTo(21000, 2); // (0.3*40000 + 0.2*45000)
      expect(response.body.averageCostBasis).toBeCloseTo(42000, 2); // 21000/0.5
    });
  });

  describe('GET /lots/pnl', () => {
    beforeEach(async () => {
      // Create lot
      const lot = await prisma.lot.create({
        data: {
          asset: 'ETH',
          quantity: 1.0,
          costBasis: 2000,
          costPerUnit: 2000,
          acquiredAt: new Date('2024-01-01'),
          remainingQty: 0,
          disposed: true,
        },
      });

      // Create disposal
      await prisma.lotDisposal.create({
        data: {
          lotId: lot.id,
          quantityDisposed: 1.0,
          proceedsPerUnit: 3000,
          totalProceeds: 3000,
          costBasisPerUnit: 2000,
          totalCostBasis: 2000,
          realizedPnL: 1000,
          disposedAt: new Date('2024-02-01'),
        },
      });
    });

    it('should get realized P&L for period', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/lots/pnl?startDate=2024-01-01&endDate=2024-12-31')
        .expect(200);

      expect(response.body).toMatchObject({
        totalRealized: 1000,
        totalCostBasis: 2000,
        totalProceeds: 3000,
        disposals: expect.arrayContaining([
          expect.objectContaining({
            asset: 'ETH',
            quantity: 1.0,
            realizedPnL: 1000,
          }),
        ]),
      });
    });

    it('should filter by asset', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/lots/pnl?asset=ETH&startDate=2024-01-01&endDate=2024-12-31')
        .expect(200);

      expect(response.body.disposals.every((d: any) => d.asset === 'ETH')).toBe(true);
    });

    it('should require date parameters', async () => {
      await request(app.getHttpServer())
        .get('/api/lots/pnl')
        .expect(500); // Error thrown
    });
  });

  describe('FIFO Calculation Accuracy', () => {
    it('should calculate complex FIFO scenario correctly', async () => {
      // Scenario: Buy 3 lots, sell 2.5 units
      await prisma.lot.createMany({
        data: [
          {
            asset: 'TOKEN',
            quantity: 1.0,
            costBasis: 100,
            costPerUnit: 100,
            acquiredAt: new Date('2024-01-01'),
            remainingQty: 1.0,
            disposed: false,
          },
          {
            asset: 'TOKEN',
            quantity: 1.0,
            costBasis: 110,
            costPerUnit: 110,
            acquiredAt: new Date('2024-01-02'),
            remainingQty: 1.0,
            disposed: false,
          },
          {
            asset: 'TOKEN',
            quantity: 1.0,
            costBasis: 120,
            costPerUnit: 120,
            acquiredAt: new Date('2024-01-03'),
            remainingQty: 1.0,
            disposed: false,
          },
        ],
      });

      const response = await request(app.getHttpServer())
        .post('/api/lots/dispose')
        .send({
          asset: 'TOKEN',
          quantity: 2.5,
          proceeds: 400, // Selling at $160 per unit
          disposedAt: '2024-02-01',
        })
        .expect(201);

      // Expected:
      // Lot 1: 1.0 @ 100 = 100 cost, 160 proceeds, 60 P&L
      // Lot 2: 1.0 @ 110 = 110 cost, 160 proceeds, 50 P&L
      // Lot 3: 0.5 @ 120 = 60 cost, 80 proceeds, 20 P&L
      // Total: 270 cost, 400 proceeds, 130 P&L

      expect(response.body.totalCostBasis).toBeCloseTo(270, 2);
      expect(response.body.totalProceeds).toBe(400);
      expect(response.body.totalRealizedPnL).toBeCloseTo(130, 2);
    });
  });
});
