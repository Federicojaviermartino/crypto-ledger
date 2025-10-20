import { EthereumIndexer } from '@crypto-ledger/crypto/indexers/ethereum-indexer';
import { PrismaClient } from '@prisma/client';
import { BlockchainEventService } from '@crypto-ledger/crypto/services/blockchain-event.service';

const prisma = new PrismaClient();

describe('Ethereum Indexer', () => {
  // Note: These are integration tests requiring a real/mock RPC endpoint
  const TEST_RPC_URL = process.env.TEST_ETH_RPC_URL || 'https://ethereum-goerli.publicnode.com';

  let indexer: EthereumIndexer;
  let eventService: BlockchainEventService;

  beforeAll(() => {
    indexer = new EthereumIndexer({
      chain: 'ethereum',
      network: 'goerli',
      rpcUrl: TEST_RPC_URL,
    });

    eventService = new BlockchainEventService(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('should connect to RPC and get latest block', async () => {
    const latestBlock = await indexer.getLatestBlockNumber();
    expect(latestBlock).toBeGreaterThan(0n);
  }, 30000);

  it('should index a small block range', async () => {
    const latestBlock = await indexer.getLatestBlockNumber();
    const fromBlock = latestBlock - 10n;
    const toBlock = latestBlock - 5n;

    const events = await indexer.indexBlockRange(fromBlock, toBlock);

    expect(Array.isArray(events)).toBe(true);
    console.log(`Indexed ${events.length} events from blocks ${fromBlock}-${toBlock}`);

    if (events.length > 0) {
      const firstEvent = events[0];
      expect(firstEvent).toMatchObject({
        chain: 'ethereum',
        network: 'goerli',
        txHash: expect.any(String),
        from: expect.any(String),
        to: expect.any(String),
        quantity: expect.any(String),
      });
    }
  }, 60000);

  it('should handle idempotent upsert of events', async () => {
    const latestBlock = await indexer.getLatestBlockNumber();
    const fromBlock = latestBlock - 5n;
    const toBlock = latestBlock - 3n;

    // Index once
    const events1 = await indexer.indexBlockRange(fromBlock, toBlock);
    const count1 = await eventService.upsertEvents(events1);

    // Index again (should be idempotent)
    const events2 = await indexer.indexBlockRange(fromBlock, toBlock);
    const count2 = await eventService.upsertEvents(events2);

    expect(count1).toBe(count2);
    console.log(`Idempotency verified: ${count1} events on both runs`);
  }, 60000);

  it('should persist and retrieve cursor', async () => {
    const testBlock = 12345678n;

    await eventService.updateCursor('ethereum', 'goerli', testBlock);
    const cursor = await eventService.getCursor('ethereum', 'goerli');

    expect(cursor).toBe(testBlock);
  });

  it('should retrieve unprocessed events', async () => {
    const unprocessed = await eventService.getUnprocessedEvents(10);

    expect(Array.isArray(unprocessed)).toBe(true);
    console.log(`Found ${unprocessed.length} unprocessed events`);

    if (unprocessed.length > 0) {
      expect(unprocessed[0].processed).toBe(false);
    }
  });
});
