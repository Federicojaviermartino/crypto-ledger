import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * E2E tests for journal entries
 * Tests double-entry balance validation and hash chain integrity
 */
describe('Journal Entries (e2e)', () => {
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

    // Create test accounts
    await prisma.account.createMany({
      data: [
        { code: '1000', name: 'Cash', type: 'asset' },
        { code: '4000', name: 'Revenue', type: 'revenue' },
      ],
      skipDuplicates: true,
    });
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /entries', () => {
    it('should create balanced entry', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/entries')
        .send({
          date: '2025-01-15',
          description: 'Test entry',
          postings: [
            { accountCode: '1000', debit: 100, credit: 0 },
            { accountCode: '4000', debit: 0, credit: 100 },
          ],
        })
        .expect(201);

      expect(response.body).toMatchObject({
        id: expect.any(String),
        description: 'Test entry',
        hash: expect.any(String),
      });

      expect(response.body.postings).toHaveLength(2);
    });

    it('should reject unbalanced entry', async () => {
      await request(app.getHttpServer())
        .post('/api/entries')
        .send({
          date: '2025-01-15',
          description: 'Unbalanced entry',
          postings: [
            { accountCode: '1000', debit: 100, credit: 0 },
            { accountCode: '4000', debit: 0, credit: 50 }, // Doesn't balance
          ],
        })
        .expect(400);
    });

    it('should reject entry with invalid account', async () => {
      await request(app.getHttpServer())
        .post('/api/entries')
        .send({
          date: '2025-01-15',
          description: 'Invalid account',
          postings: [
            { accountCode: '9999', debit: 100, credit: 0 },
            { accountCode: '4000', debit: 0, credit: 100 },
          ],
        })
        .expect(400);
    });

    it('should create hash chain between entries', async () => {
      // Create first entry
      const first = await request(app.getHttpServer())
        .post('/api/entries')
        .send({
          date: '2025-01-15',
          description: 'First entry',
          postings: [
            { accountCode: '1000', debit: 100, credit: 0 },
            { accountCode: '4000', debit: 0, credit: 100 },
          ],
        })
        .expect(201);

      // Create second entry
      const second = await request(app.getHttpServer())
        .post('/api/entries')
        .send({
          date: '2025-01-16',
          description: 'Second entry',
          postings: [
            { accountCode: '1000', debit: 200, credit: 0 },
            { accountCode: '4000', debit: 0, credit: 200 },
          ],
        })
        .expect(201);

      // Second entry should link to first
      expect(second.body.prevHash).toBe(first.body.hash);
    });
  });

  describe('GET /entries', () => {
    it('should list entries with pagination', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/entries')
        .expect(200);

      expect(response.body).toMatchObject({
        entries: expect.any(Array),
        pagination: {
          total: expect.any(Number),
          skip: 0,
          take: 50,
        },
      });
    });

    it('should filter by date range', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/entries?startDate=2025-01-01&endDate=2025-01-31')
        .expect(200);

      expect(response.body.entries).toBeInstanceOf(Array);
    });
  });

  describe('GET /entries/:id', () => {
    it('should get entry by id', async () => {
      // Create entry
      const created = await request(app.getHttpServer())
        .post('/api/entries')
        .send({
          date: '2025-01-15',
          description: 'Test get',
          postings: [
            { accountCode: '1000', debit: 100, credit: 0 },
            { accountCode: '4000', debit: 0, credit: 100 },
          ],
        });

      // Get entry
      const response = await request(app.getHttpServer())
        .get(`/api/entries/${created.body.id}`)
        .expect(200);

      expect(response.body).toMatchObject({
        id: created.body.id,
        description: 'Test get',
      });
    });

    it('should return 404 for non-existent entry', async () => {
      await request(app.getHttpServer())
        .get('/api/entries/non-existent-id')
        .expect(404);
    });
  });

  describe('GET /entries/:id/proof', () => {
    it('should get hash chain proof', async () => {
      // Create entry
      const created = await request(app.getHttpServer())
        .post('/api/entries')
        .send({
          date: '2025-01-15',
          description: 'Test proof',
          postings: [
            { accountCode: '1000', debit: 100, credit: 0 },
            { accountCode: '4000', debit: 0, credit: 100 },
          ],
        });

      // Get proof
      const response = await request(app.getHttpServer())
        .get(`/api/entries/${created.body.id}/proof`)
        .expect(200);

      expect(response.body).toMatchObject({
        entryId: created.body.id,
        hash: created.body.hash,
        chainIntact: true,
        proof: expect.any(Array),
      });
    });
  });

  describe('GET /entries/verify/chain', () => {
    it('should verify entire hash chain', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/entries/verify/chain')
        .expect(200);

      expect(response.body).toMatchObject({
        isValid: expect.any(Boolean),
        totalEntries: expect.any(Number),
        errors: expect.any(Array),
        proof: expect.any(Array),
      });

      expect(response.body.isValid).toBe(true);
    });
  });

  describe('Double-Entry Invariants', () => {
    it('should maintain balance across multiple entries', async () => {
      // Create several entries
      await request(app.getHttpServer())
        .post('/api/entries')
        .send({
          date: '2025-01-15',
          description: 'Entry 1',
          postings: [
            { accountCode: '1000', debit: 1000, credit: 0 },
            { accountCode: '4000', debit: 0, credit: 1000 },
          ],
        });

      await request(app.getHttpServer())
        .post('/api/entries')
        .send({
          date: '2025-01-16',
          description: 'Entry 2',
          postings: [
            { accountCode: '1000', debit: 500, credit: 0 },
            { accountCode: '4000', debit: 0, credit: 500 },
          ],
        });

      // Verify total debits = total credits
      const entries = await prisma.journalEntry.findMany({
        include: { postings: true },
      });

      let totalDebit = 0;
      let totalCredit = 0;

      for (const entry of entries) {
        for (const posting of entry.postings) {
          totalDebit += posting.debit;
          totalCredit += posting.credit;
        }
      }

      expect(totalDebit).toBeCloseTo(totalCredit, 2);
    });
  });
});
