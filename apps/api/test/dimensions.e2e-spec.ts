import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Dimensional Accounting (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

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

  describe('GET /dimensions', () => {
    it('should return all active dimensions', async () => {
      const response = await request(app.getHttpServer())
        .get('/dimensions')
        .expect(200);

      expect(response.body).toBeInstanceOf(Array);
      expect(response.body.length).toBeGreaterThan(0);
      
      const legalEntity = response.body.find((d: any) => d.code === 'legal_entity');
      expect(legalEntity).toBeDefined();
      expect(legalEntity.values).toBeInstanceOf(Array);
    });
  });

  describe('POST /entries with dimensions', () => {
    it('should create entry with valid dimensions', async () => {
      const response = await request(app.getHttpServer())
        .post('/entries')
        .send({
          date: '2025-01-15',
          description: 'Sale with dimensional tracking',
          postings: [
            {
              accountCode: '1100',
              debit: 1000,
              dimensions: {
                legal_entity: 'LE-US-001',
                cost_center: 'CC-SALES',
                project: 'PRJ-ALPHA',
              },
            },
            {
              accountCode: '4000',
              credit: 1000,
              dimensions: {
                legal_entity: 'LE-US-001',
                cost_center: 'CC-SALES',
                product: 'PROD-CORE',
              },
            },
          ],
        })
        .expect(201);

      expect(response.body.id).toBeDefined();
      expect(response.body.postings).toHaveLength(2);
      expect(response.body.postings[0].dimensions.length).toBeGreaterThan(0);
    });

    it('should reject invalid dimension code', async () => {
      await request(app.getHttpServer())
        .post('/entries')
        .send({
          date: '2025-01-15',
          description: 'Invalid dimension',
          postings: [
            {
              accountCode: '1100',
              debit: 500,
              dimensions: { invalid_dim: 'BAD-001' },
            },
            {
              accountCode: '4000',
              credit: 500,
            },
          ],
        })
        .expect(400);
    });

    it('should reject invalid dimension value', async () => {
      await request(app.getHttpServer())
        .post('/entries')
        .send({
          date: '2025-01-15',
          description: 'Invalid value',
          postings: [
            {
              accountCode: '1100',
              debit: 500,
              dimensions: { legal_entity: 'INVALID-999' },
            },
            {
              accountCode: '4000',
              credit: 500,
            },
          ],
        })
        .expect(400);
    });
  });

  describe('GET /reports/trial-balance with grouping', () => {
    beforeAll(async () => {
      // Create test entries
      await request(app.getHttpServer())
        .post('/entries')
        .send({
          date: '2025-01-20',
          description: 'LE-US sales',
          postings: [
            {
              accountCode: '1100',
              debit: 2000,
              dimensions: { legal_entity: 'LE-US-001', cost_center: 'CC-SALES' },
            },
            {
              accountCode: '4000',
              credit: 2000,
              dimensions: { legal_entity: 'LE-US-001', cost_center: 'CC-SALES' },
            },
          ],
        });

      await request(app.getHttpServer())
        .post('/entries')
        .send({
          date: '2025-01-21',
          description: 'LE-EU sales',
          postings: [
            {
              accountCode: '1100',
              debit: 1500,
              dimensions: { legal_entity: 'LE-EU-001', cost_center: 'CC-ENG' },
            },
            {
              accountCode: '4000',
              credit: 1500,
              dimensions: { legal_entity: 'LE-EU-001', cost_center: 'CC-ENG' },
            },
          ],
        });
    });

    it('should return grouped trial balance by legal_entity', async () => {
      const response = await request(app.getHttpServer())
        .get('/reports/trial-balance?groupBy=legal_entity')
        .expect(200);

      expect(response.body.balances).toBeInstanceOf(Array);
      expect(response.body.summary.isBalanced).toBe(true);
      expect(response.body.summary.groupedBy).toEqual(['legal_entity']);

      const usBalances = response.body.balances.filter(
        (b: any) => b.dimensions.legal_entity === 'LE-US-001'
      );
      expect(usBalances.length).toBeGreaterThan(0);
    });

    it('should return grouped trial balance by multiple dimensions', async () => {
      const response = await request(app.getHttpServer())
        .get('/reports/trial-balance?groupBy=legal_entity,cost_center')
        .expect(200);

      expect(response.body.balances).toBeInstanceOf(Array);
      expect(response.body.summary.isBalanced).toBe(true);
      
      const groups = response.body.balances.map((b: any) => 
        `${b.dimensions.legal_entity}|${b.dimensions.cost_center}`
      );
      expect(new Set(groups).size).toBeGreaterThan(1);
    });

    it('should filter by dimension', async () => {
      const response = await request(app.getHttpServer())
        .get('/reports/trial-balance?legal_entity=LE-US-001')
        .expect(200);

      expect(response.body.summary.isBalanced).toBe(true);
      expect(response.body.summary.filters).toEqual({ legal_entity: 'LE-US-001' });
    });

    it('should verify global balance across all groups', async () => {
      const response = await request(app.getHttpServer())
        .get('/reports/trial-balance?groupBy=legal_entity,cost_center')
        .expect(200);

      const { totalDebit, totalCredit, isBalanced } = response.body.summary;
      
      expect(Math.abs(totalDebit - totalCredit)).toBeLessThan(0.01);
      expect(isBalanced).toBe(true);
    });
  });
});
