import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * E2E tests for bank reconciliation
 */
describe('Reconciliation (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let bankAccountId: string;
  let cashAccountId: string;

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
    await prisma.bankReconciliation.deleteMany({});
    await prisma.bankTransaction.deleteMany({});
    await prisma.bankStatement.deleteMany({});
    await prisma.bankAccount.deleteMany({});

    // Create cash account
    const cashAccount = await prisma.account.create({
      data: {
        code: '1000-TEST',
        name: 'Cash Test',
        type: 'asset',
      },
    });
    cashAccountId = cashAccount.id;

    // Create bank account
    const bankAccount = await prisma.bankAccount.create({
      data: {
        accountNumber: 'ES0000000000000000000000',
        bankName: 'Test Bank',
        currency: 'EUR',
        glAccountId: cashAccountId,
      },
    });
    bankAccountId = bankAccount.id;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /reconciliation/bank/:id/import/csv', () => {
    it('should import CSV bank statement', async () => {
      const csvContent = `Date,Amount,Description,Reference
15/01/2025,100.00,Payment received,REF001
16/01/2025,-50.50,Purchase,REF002
17/01/2025,200.00,Invoice payment,REF003`;

      const response = await request(app.getHttpServer())
        .post(`/api/reconciliation/bank/${bankAccountId}/import/csv`)
        .field('statementDate', '2025-01-31')
        .field('format', 'generic')
        .attach('file', Buffer.from(csvContent), 'statement.csv')
        .expect(201);

      expect(response.body).toMatchObject({
        statementId: expect.any(String),
        transactionCount: 3,
      });
    });

    it('should parse amounts correctly', async () => {
      const csvContent = `Date,Amount,Description
15/01/2025,"1.234,56",European format
16/01/2025,"-999,99",Negative amount`;

      const response = await request(app.getHttpServer())
        .post(`/api/reconciliation/bank/${bankAccountId}/import/csv`)
        .field('statementDate', '2025-01-31')
        .attach('file', Buffer.from(csvContent), 'test.csv')
        .expect(201);

      expect(response.body.transactionCount).toBe(2);
    });
  });

  describe('POST /reconciliation/bank/:id/import/camt053', () => {
    it('should import camt.053 XML statement', async () => {
      const xmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.02">
  <BkToCstmrStmt>
    <Stmt>
      <Bal>
        <Tp><CdOrPrtry><Cd>OPBD</Cd></CdOrPrtry></Tp>
        <Amt Ccy="EUR">1000.00</Amt>
        <CdtDbtInd>CRDT</CdtDbtInd>
      </Bal>
      <Bal>
        <Tp><CdOrPrtry><Cd>CLBD</Cd></CdOrPrtry></Tp>
        <Amt Ccy="EUR">1250.00</Amt>
        <CdtDbtInd>CRDT</CdtDbtInd>
      </Bal>
      <Ntry>
        <Amt Ccy="EUR">250.00</Amt>
        <CdtDbtInd>CRDT</CdtDbtInd>
        <BookgDt><Dt>2025-01-15</Dt></BookgDt>
        <ValDt><Dt>2025-01-15</Dt></ValDt>
        <NtryDtls><TxDtls><RmtInf><Ustrd>Payment received</Ustrd></RmtInf></TxDtls></NtryDtls>
        <AcctSvcrRef>REF001</AcctSvcrRef>
      </Ntry>
    </Stmt>
  </BkToCstmrStmt>
</Document>`;

      const response = await request(app.getHttpServer())
        .post(`/api/reconciliation/bank/${bankAccountId}/import/camt053`)
        .field('statementDate', '2025-01-31')
        .attach('file', Buffer.from(xmlContent), 'statement.xml')
        .expect(201);

      expect(response.body).toMatchObject({
        statementId: expect.any(String),
        transactionCount: 1,
      });
    });
  });

  describe('GET /reconciliation/transactions/:id/matches', () => {
    let transactionId: string;
    let entryId: string;

    beforeEach(async () => {
      // Create journal entry
      const entry = await prisma.journalEntry.create({
        data: {
          date: new Date('2025-01-15'),
          description: 'Customer payment XYZ',
          hash: 'hash123',
          postings: {
            create: [
              { accountId: cashAccountId, debit: 500, credit: 0 },
              { accountId: cashAccountId, debit: 0, credit: 500 },
            ],
          },
        },
      });
      entryId = entry.id;

      // Create statement with transaction
      const statement = await prisma.bankStatement.create({
        data: {
          bankAccountId,
          statementDate: new Date('2025-01-31'),
          openingBalance: 1000,
          closingBalance: 1500,
        },
      });

      const transaction = await prisma.bankTransaction.create({
        data: {
          statementId: statement.id,
          transactionDate: new Date('2025-01-15'),
          valueDate: new Date('2025-01-15'),
          amount: 500,
          description: 'Payment from customer XYZ',
        },
      });
      transactionId = transaction.id;
    });

    it('should find matching journal entries', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/reconciliation/transactions/${transactionId}/matches`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0);
      expect(response.body[0]).toMatchObject({
        entryId: expect.any(String),
        score: expect.any(Number),
        reasons: expect.any(Array),
      });
    });

    it('should score exact matches highly', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/reconciliation/transactions/${transactionId}/matches`)
        .expect(200);

      const bestMatch = response.body[0];
      expect(bestMatch.score).toBeGreaterThan(0.7);
      expect(bestMatch.reasons).toContain('Same date');
    });
  });

  describe('POST /reconciliation/transactions/:id/match/:entryId', () => {
    let transactionId: string;
    let entryId: string;

    beforeEach(async () => {
      const entry = await prisma.journalEntry.create({
        data: {
          date: new Date('2025-01-15'),
          description: 'Test entry',
          hash: 'hash456',
          postings: {
            create: [
              { accountId: cashAccountId, debit: 100, credit: 0 },
              { accountId: cashAccountId, debit: 0, credit: 100 },
            ],
          },
        },
      });
      entryId = entry.id;

      const statement = await prisma.bankStatement.create({
        data: {
          bankAccountId,
          statementDate: new Date('2025-01-31'),
          openingBalance: 0,
          closingBalance: 100,
        },
      });

      const transaction = await prisma.bankTransaction.create({
        data: {
          statementId: statement.id,
          transactionDate: new Date('2025-01-15'),
          valueDate: new Date('2025-01-15'),
          amount: 100,
          description: 'Test transaction',
        },
      });
      transactionId = transaction.id;
    });

    it('should manually match transaction to entry', async () => {
      const response = await request(app.getHttpServer())
        .post(`/api/reconciliation/transactions/${transactionId}/match/${entryId}`)
        .expect(201);

      expect(response.body).toMatchObject({
        id: expect.any(String),
        bankTransactionId: transactionId,
        matchType: 'manual',
        confidence: 1.0,
      });

      // Verify transaction is marked as matched
      const transaction = await prisma.bankTransaction.findUnique({
        where: { id: transactionId },
      });

      expect(transaction?.matched).toBe(true);
      expect(transaction?.matchedEntryId).toBe(entryId);
    });
  });

  describe('POST /reconciliation/bank/:id/auto-reconcile', () => {
    beforeEach(async () => {
      // Create matching entry and transaction
      const entry = await prisma.journalEntry.create({
        data: {
          date: new Date('2025-01-20'),
          description: 'Auto match test',
          hash: 'hash789',
          reference: 'AUTO-REF',
          postings: {
            create: [
              { accountId: cashAccountId, debit: 750, credit: 0 },
              { accountId: cashAccountId, debit: 0, credit: 750 },
            ],
          },
        },
      });

      const statement = await prisma.bankStatement.create({
        data: {
          bankAccountId,
          statementDate: new Date('2025-01-31'),
          openingBalance: 0,
          closingBalance: 750,
        },
      });

      await prisma.bankTransaction.create({
        data: {
          statementId: statement.id,
          transactionDate: new Date('2025-01-20'),
          valueDate: new Date('2025-01-20'),
          amount: 750,
          description: 'Auto match test',
          reference: 'AUTO-REF',
        },
      });
    });

    it('should auto-reconcile high-confidence matches', async () => {
      const response = await request(app.getHttpServer())
        .post(`/api/reconciliation/bank/${bankAccountId}/auto-reconcile`)
        .send({ minScore: 0.9 })
        .expect(201);

      expect(response.body.reconciled).toBeGreaterThan(0);
    });
  });

  describe('GET /reconciliation/bank/:id/unmatched', () => {
    beforeEach(async () => {
      const statement = await prisma.bankStatement.create({
        data: {
          bankAccountId,
          statementDate: new Date('2025-01-31'),
          openingBalance: 0,
          closingBalance: 300,
        },
      });

      await prisma.bankTransaction.createMany({
        data: [
          {
            statementId: statement.id,
            transactionDate: new Date('2025-01-25'),
            valueDate: new Date('2025-01-25'),
            amount: 150,
            description: 'Unmatched 1',
            matched: false,
          },
          {
            statementId: statement.id,
            transactionDate: new Date('2025-01-26'),
            valueDate: new Date('2025-01-26'),
            amount: 150,
            description: 'Unmatched 2',
            matched: false,
          },
        ],
      });
    });

    it('should return unmatched transactions', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/reconciliation/bank/${bankAccountId}/unmatched`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThanOrEqual(2);
      expect(response.body.every((t: any) => !t.matched)).toBe(true);
    });
  });
});
