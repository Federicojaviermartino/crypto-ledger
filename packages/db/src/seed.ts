
import { PrismaClient, AccountType } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Basic CoA (Chart of Accounts)
  const accounts = [
    { code: '1000', name: 'Cash', type: AccountType.Asset },
    { code: '1100', name: 'Crypto Holdings', type: AccountType.Asset },
    { code: '2000', name: 'Accounts Payable', type: AccountType.Liability },
    { code: '3000', name: 'Owner Equity', type: AccountType.Equity },
    { code: '4000', name: 'Revenue', type: AccountType.Income },
    { code: '5000', name: 'Operating Expenses', type: AccountType.Expense },
    { code: '5100', name: 'Network Fees', type: AccountType.Expense },
  ];

  for (const a of accounts) {
    await prisma.account.upsert({
      where: { code: a.code },
      update: {},
      create: a as any,
    });
  }

  // Example assets
  await prisma.asset.upsert({
    where: { symbol_chain: { symbol: 'BTC', chain: 'bitcoin' } },
    update: {},
    create: { symbol: 'BTC', chain: 'bitcoin', name: 'Bitcoin' }
  });
  await prisma.asset.upsert({
    where: { symbol_chain: { symbol: 'ETH', chain: 'ethereum' } },
    update: {},
    create: { symbol: 'ETH', chain: 'ethereum', name: 'Ether' }
  });

  console.log('Seed completed.');
}

main().finally(async () => prisma.$disconnect());
