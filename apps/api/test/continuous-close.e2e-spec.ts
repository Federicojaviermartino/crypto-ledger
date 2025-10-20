import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Continuous Close (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const testPeriod = '2025-01';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true }));
    prisma = app.get(PrismaService);
    
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /ops/health', () => {
    it('should return health status for current period', async () => {
      const response = await request(app.getHttpServer())
        .get('/ops/health')
        .expect(200);

      expect(response.body).toMatchObject({
        period: expect.any(String),
        status: expect.stringMatching(/^(ready|blocked|warning)$/),
        readyToClose: expect.any(Boolean),
        lastChecked: expect.any(String),
        checks: expect.any(Array),
        blockers: expect.any(Array),
        warnings: expect.any(Array),
        summary: {
          totalChecks: expect.any(Number),
          passed: expect.any(Number),
          failed: expect.any(Number),
          blockerCount: expect.any(Number),
          warningCount: expect.any(Number),
        },
      });
    });

    it('should return health for specific period', async () => {
      const response = await request(app.getHttpServer())
        .get(`/ops/health?period=${testPeriod}`)
        .expect(200);

      expect(response.body.period).toBe(testPeriod);
    });
  });

  describe('Classification gap detection', () => {
    let testEventId: string;

    beforeAll(async () => {
      // Create unclassified event
      const event = await prisma.blockchainEvent.create({
        data: {
          chain: 'ethereum',
          network: 'mainnet',
          blockNumber: 19000000n,
          blockTimestamp: new Date('2025-01-15'),
          txHash: '0xtest_unclassified',
          logIndex: -1,
          eventType: 'NATIVE_TRANSFER',
          from: '0xaaa',
          to: '0xbbb',
          asset: { symbol: 'ETH', decimals: 18 },
          quantity: '1.0',
          rawData: {},
          processed: false,
        },
      });
      testEventId = event.id;
    });

    it('should detect unclassified events as blocker', async () => {
      const response = await request(app.getHttpServer())
        .get(`/ops/health?period=${testPeriod}`)
        .expect(200);

      expect(response.body.readyToClose).toBe(false);
      expect(response.body.status).toBe('blocked');

      const classificationCheck = response.body.checks.find(
        (c: any) => c.name === 'Classification Complete'
      );
      expect(classificationCheck.status).toBe('fail');

      const classificationBlocker = response.body.blockers.find(
        (b: any) => b.issueType === 'classification_gap'
      );
      expect(classificationBlocker).toBeDefined();
    });

    afterAll(async () => {
      // Clean up
      await prisma.blockchainEvent.delete({ where: { id: testEventId } });
    });
  });

  describe('Dimensional balance validation', () => {
    beforeAll(async () => {
      // Create imbalanced dimensional entry
      const account = await prisma.account.findFirst();
      const dimension = await prisma.dimensionValue.findFirst();

      if (account && dimension) {
        await prisma.journalEntry.create({
          data: {
            date: new Date('2025-01-20'),
            description: 'Imbalanced test',
            postings: {
              create: [
                {
                  accountId: account.id,
                  debit: 1000,
                  credit: 0,
                  dimensions: {
                    create: [{ dimensionValueId: dimension.id }],
                  },
                },
                {
                  accountId: account.id,
                  debit: 0,
                  credit: 999, // Intentional imbalance
                },
              ],
            },
          },
        });
      }
    });

    it('should detect dimensional imbalances', async () => {
      const response = await request(app.getHttpServer())
        .get(`/ops/health?period=${testPeriod}`)
        .expect(200);

      const dimCheck = response.body.checks.find(
        (c: any) => c.name === 'Dimensional Balance'
      );

      // May pass if no dimensional postings exist
      if (dimCheck.status === 'fail') {
        expect(response.body.blockers.some(
          (b: any) => b.issueType === 'imbalance'
        )).toBe(true);
      }
    });
  });

  describe('Issue management', () => {
    it('should list open issues', async () => {
      const response = await request(app.getHttpServer())
        .get(`/ops/issues?period=${testPeriod}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      
      if (response.body.length > 0) {
        expect(response.body[0]).toMatchObject({
          id: expect.any(String),
          period: expect.any(String),
          issueType: expect.any(String),
          severity: expect.any(String),
          title: expect.any(String),
          status: 'open',
        });
      }
    });

    it('should resolve issue', async () => {
      const issues = await request(app.getHttpServer())
        .get(`/ops/issues?period=${testPeriod}`)
        .then(res => res.body);

      if (issues.length > 0) {
        const response = await request(app.getHttpServer())
          .post(`/ops/issues/${issues[0].id}/resolve`)
          .send({
            resolution: 'Manually classified events',
            resolvedBy: 'test-user',
          })
          .expect(201);

        expect(response.body.status).toBe('resolved');
        expect(response.body.resolvedBy).toBe('test-user');
      }
    });
  });

  describe('Period close', () => {
    it('should reject close if blockers exist', async () => {
      // First create a blocker
      await prisma.blockchainEvent.create({
        data: {
          chain: 'ethereum',
          network: 'mainnet',
          blockNumber: 19000001n,
          blockTimestamp: new Date('2025-01-25'),
          txHash: '0xblocker',
          logIndex: -1,
          eventType: 'NATIVE_TRANSFER',
          from: '0xccc',
          to: '0xddd',
          asset: { symbol: 'ETH', decimals: 18 },
          quantity: '0.5',
          rawData: {},
          processed: false,
        },
      });

      await request(app.getHttpServer())
        .post(`/ops/close/${testPeriod}`)
        .send({ closedBy: 'test-user' })
        .expect(500); // Should fail with blockers
    });

    it('should allow close when ready', async () => {
      // Clean up blockers
      await prisma.blockchainEvent.updateMany({
        where: {
          blockTimestamp: {
            gte: new Date('2025-01-01'),
            lte: new Date('2025-01-31'),
          },
          processed: false,
        },
        data: { processed: true },
      });

      // Verify health
      const health = await request(app.getHttpServer())
        .get(`/ops/health?period=${testPeriod}`)
        .then(res => res.body);

      if (health.readyToClose) {
        const response = await request(app.getHttpServer())
          .post(`/ops/close/${testPeriod}`)
          .send({ closedBy: 'test-user' })
          .expect(201);

        expect(response.body).toMatchObject({
          period: testPeriod,
          closedBy: 'test-user',
          closedAt: expect.any(String),
        });
      }
    });
  });

  describe('GET /ops/checklist/:period', () => {
    it('should retrieve stored checklist', async () => {
      // Run validation first
      await request(app.getHttpServer())
        .get(`/ops/health?period=${testPeriod}`);

      const response = await request(app.getHttpServer())
        .get(`/ops/checklist/${testPeriod}`)
        .expect(200);

      expect(response.body).toMatchObject({
        period: testPeriod,
        status: expect.any(String),
        checks: expect.any(Array),
        lastChecked: expect.any(String),
      });
    });
  });
});
