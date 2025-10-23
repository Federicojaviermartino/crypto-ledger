import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // 1. Create Chart of Accounts
  console.log('📊 Creating chart of accounts...');
  
  const accounts = [
    // Assets (1000-1999)
    { code: '1000', name: 'Cash', type: 'asset' },
    { code: '1100', name: 'Crypto Assets', type: 'asset' },
    { code: '1200', name: 'Accounts Receivable', type: 'asset' },
    { code: '1900', name: 'Suspense - Assets', type: 'asset' },
    
    // Liabilities (2000-2999)
    { code: '2000', name: 'Accounts Payable', type: 'liability' },
    { code: '2100', name: 'Accrued Expenses', type: 'liability' },
    { code: '2900', name: 'Suspense - Liabilities', type: 'liability' },
    
    // Equity (3000-3999)
    { code: '3000', name: 'Capital', type: 'equity' },
    { code: '3100', name: 'Retained Earnings', type: 'equity' },
    
    // Revenue (4000-4999)
    { code: '4000', name: 'Revenue', type: 'revenue' },
    { code: '4100', name: 'Crypto Gains', type: 'revenue' },
    
    // Expenses (5000-6999)
    { code: '6000', name: 'Operating Expenses', type: 'expense' },
    { code: '6100', name: 'Network Fees', type: 'expense' },
    { code: '6200', name: 'Crypto Losses', type: 'expense' },
  ];

  for (const account of accounts) {
    await prisma.account.upsert({
      where: { code: account.code },
      update: {},
      create: account,
    });
  }

  console.log(`✅ Created ${accounts.length} accounts`);

  // 2. Create 7 First-Class Dimensions
  console.log('📐 Creating dimensions...');
  
  const dimensions = [
    {
      code: 'legal_entity',
      name: 'Legal Entity',
      description: 'Legal entity / subsidiary',
    },
    {
      code: 'cost_center',
      name: 'Cost Center',
      description: 'Department or cost center',
    },
    {
      code: 'project',
      name: 'Project',
      description: 'Project or initiative',
    },
    {
      code: 'product',
      name: 'Product',
      description: 'Product line',
    },
    {
      code: 'wallet',
      name: 'Wallet',
      description: 'Crypto wallet address',
    },
    {
      code: 'geography',
      name: 'Geography',
      description: 'Geographic region',
    },
    {
      code: 'custom_kv',
      name: 'Custom Key-Value',
      description: 'Custom dimension',
    },
  ];

  for (const dimension of dimensions) {
    await prisma.dimension.upsert({
      where: { code: dimension.code },
      update: {},
      create: dimension,
    });
  }

  console.log(`✅ Created ${dimensions.length} dimensions`);

  // 3. Create Sample Dimension Values
  console.log('🏷️  Creating dimension values...');

  // Legal Entity values
  const legalEntityDim = await prisma.dimension.findUnique({
    where: { code: 'legal_entity' },
  });

  if (legalEntityDim) {
    const legalEntities = [
      { code: 'LE-US-001', name: 'US Parent Corp' },
      { code: 'LE-EU-001', name: 'EU Subsidiary GmbH' },
      { code: 'LE-UK-001', name: 'UK Branch Ltd' },
    ];

    for (const entity of legalEntities) {
      await prisma.dimensionValue.upsert({
        where: {
          dimensionId_code: {
            dimensionId: legalEntityDim.id,
            code: entity.code,
          },
        },
        update: {},
        create: {
          dimensionId: legalEntityDim.id,
          code: entity.code,
          name: entity.name,
        },
      });
    }

    console.log(`✅ Created ${legalEntities.length} legal entities`);
  }

  // Cost Center values
  const costCenterDim = await prisma.dimension.findUnique({
    where: { code: 'cost_center' },
  });

  if (costCenterDim) {
    const costCenters = [
      { code: 'CC-SALES', name: 'Sales Department' },
      { code: 'CC-ENG', name: 'Engineering' },
      { code: 'CC-OPS', name: 'Operations' },
      { code: 'CC-ADMIN', name: 'Administration' },
    ];

    for (const cc of costCenters) {
      await prisma.dimensionValue.upsert({
        where: {
          dimensionId_code: {
            dimensionId: costCenterDim.id,
            code: cc.code,
          },
        },
        update: {},
        create: {
          dimensionId: costCenterDim.id,
          code: cc.code,
          name: cc.name,
        },
      });
    }

    console.log(`✅ Created ${costCenters.length} cost centers`);
  }

  // Project values
  const projectDim = await prisma.dimension.findUnique({
    where: { code: 'project' },
  });

  if (projectDim) {
    const projects = [
      { code: 'PRJ-ALPHA', name: 'Project Alpha' },
      { code: 'PRJ-BETA', name: 'Project Beta' },
    ];

    for (const project of projects) {
      await prisma.dimensionValue.upsert({
        where: {
          dimensionId_code: {
            dimensionId: projectDim.id,
            code: project.code,
          },
        },
        update: {},
        create: {
          dimensionId: projectDim.id,
          code: project.code,
          name: project.name,
        },
      });
    }

    console.log(`✅ Created ${projects.length} projects`);
  }

  // Geography values
  const geographyDim = await prisma.dimension.findUnique({
    where: { code: 'geography' },
  });

  if (geographyDim) {
    const geographies = [
      { code: 'GEO-NA', name: 'North America' },
      { code: 'GEO-EU', name: 'Europe' },
      { code: 'GEO-APAC', name: 'Asia Pacific' },
    ];

    for (const geo of geographies) {
      await prisma.dimensionValue.upsert({
        where: {
          dimensionId_code: {
            dimensionId: geographyDim.id,
            code: geo.code,
          },
        },
        update: {},
        create: {
          dimensionId: geographyDim.id,
          code: geo.code,
          name: geo.name,
        },
      });
    }

    console.log(`✅ Created ${geographies.length} geographies`);
  }

  console.log('✅ Database seeded successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
