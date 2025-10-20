import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * E2E tests for blockchain operations
 * Tests indexing, classification, and event management
 */
describe('Blockchain (e2e)', () => {
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

    // Clean blockchain data
    await prisma.blockchainEvent.deleteMany({});
    await prisma.classificationRule.deleteMany({});
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /blockchain/events', () => {
    beforeEach(async () => {
      // Create test events
      await prisma.blockchainEvent.createMany({
        data: [
          {
            chain: 'ethereum',
            network: 'mainnet',
            txHash: '0xabc123',
            blockNumber: BigInt(18000000),
            blockTimestamp: new Date('2024-01-15'),
            logIndex: 0,
            eventType: 'transfer',
            from: '0xfrom123',
            to: '0xto456',
            asset: 'ETH',
            quantity: 1.5,
            feeAmount: 0.001,
            feeCurrency: 'ETH',
            processed: false,
          },
          {
            chain: 'ethereum',
            network: 'mainnet',
            txHash: '0xdef456',
            blockNumber: BigInt(18000001),
            blockTimestamp: new Date('2024-01-16'),
            logIndex: 0,
            eventType: 'transfer',
            from: '0xfrom123',
            to: '0xto789',
            asset: 'USDC',
            tokenAddress: '0xusdc',
            quantity: 1000,
            feeAmount: 0.002,
            feeCurrency: 'ETH',
            processed: true,
            classifiedAs: 'deposit',
          },
        ],
      });
    });

    afterEach(async () => {
      await prisma.blockchainEvent.deleteMany({});
    });

    it('should list all events', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/blockchain/events')
        .expect(200);

      expect(response.body).toMatchObject({
        events: expect.any(Array),
        pagination: expect.any(Object),
      });

      expect(response.body.events).toHaveLength(2);
      expect(response.body.pagination.total).toBe(2);
    });

    it('should filter by processed status', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/blockchain/events?processed=true')
        .expect(200);

      expect(response.body.events).toHaveLength(1);
      expect(response.body.events[0].processed).toBe(true);
    });

    it('should filter by classification', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/blockchain/events?classifiedAs=deposit')
        .expect(200);

      expect(response.body.events).toHaveLength(1);
      expect(response.body.events[0].classifiedAs).toBe('deposit');
    });

    it('should filter by date range', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/blockchain/events?startDate=2024-01-16&endDate=2024-01-17')
        .expect(200);

      expect(response.body.events).toHaveLength(1);
    });

    it('should paginate results', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/blockchain/events?skip=0&take=1')
        .expect(200);

      expect(response.body.events).toHaveLength(1);
      expect(response.body.pagination.take).toBe(1);
    });
  });

  describe('GET /blockchain/events/:id', () => {
    let testEventId: string;

    beforeEach(async () => {
      const event = await prisma.blockchainEvent.create({
        data: {
          chain: 'ethereum',
          network: 'mainnet',
          txHash: '0xtest123',
          blockNumber: BigInt(18000000),
          blockTimestamp: new Date(),
          logIndex: 0,
          eventType: 'transfer',
          from: '0xfrom',
          to: '0xto',
          asset: 'ETH',
          quantity: 1.0,
          feeAmount: 0.001,
          feeCurrency: 'ETH',
        },
      });

      testEventId = event.id;
    });

    afterEach(async () => {
      await prisma.blockchainEvent.deleteMany({});
    });

    it('should get event by id', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/blockchain/events/${testEventId}`)
        .expect(200);

      expect(response.body).toMatchObject({
        id: testEventId,
        chain: 'ethereum',
        asset: 'ETH',
        quantity: 1.0,
      });
    });

    it('should return 404 for non-existent event', async () => {
      await request(app.getHttpServer())
        .get('/api/blockchain/events/non-existent-id')
        .expect(404);
    });
  });

  describe('POST /blockchain/events/:id/classify', () => {
    let testEventId: string;

    beforeEach(async () => {
      // Create classification rule
      await prisma.classificationRule.create({
        data: {
          name: 'test-rule',
          priority: 100,
          conditions: { direction: 'inbound' },
          actions: [{ type: 'mark_deposit' }],
          isActive: true,
        },
      });

      // Create event
      const event = await prisma.blockchainEvent.create({
        data: {
          chain: 'ethereum',
          network: 'mainnet',
          txHash: '0xclassify',
          blockNumber: BigInt(18000000),
          blockTimestamp: new Date(),
          logIndex: 0,
          eventType: 'transfer',
          from: '0xexternal',
          to: process.env.OUR_WALLET_ADDRESSES?.split(',')[0] || '0xours',
          asset: 'ETH',
          quantity: 1.0,
          feeAmount: 0,
          feeCurrency: 'ETH',
          processed: false,
        },
      });

      testEventId = event.id;
    });

    afterEach(async () => {
      await prisma.blockchainEvent.deleteMany({});
      await prisma.classificationRule.deleteMany({});
    });

    it('should classify event', async () => {
      const response = await request(app.getHttpServer())
        .post(`/api/blockchain/events/${testEventId}/classify`)
        .expect(201);

      expect(response.body).toMatchObject({
        id: testEventId,
        classification: expect.any(String),
      });

      // Verify event was updated
      const event = await prisma.blockchainEvent.findUnique({
        where: { id: testEventId },
      });

      expect(event?.processed).toBe(true);
      expect(event?.classifiedAs).toBeDefined();
    });
  });

  describe('GET /blockchain/status', () => {
    it('should return indexer status', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/blockchain/status')
        .expect(200);

      expect(response.body).toMatchObject({
        lastIndexedBlock: expect.any(Number),
        currentChainBlock: expect.any(Number),
        totalEvents: expect.any(Number),
        processedEvents: expect.any(Number),
        unclassifiedEvents: expect.any(Number),
      });
    });
  });
});
