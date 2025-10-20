import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Setup test environment
 * Clears database before tests
 */
beforeAll(async () => {
  // Clean database
  await prisma.journalEntry.deleteMany({});
  await prisma.account.deleteMany({});
  await prisma.dimensionValue.deleteMany({});
  await prisma.dimension.deleteMany({});
});

afterAll(async () => {
  await prisma.$disconnect();
});
