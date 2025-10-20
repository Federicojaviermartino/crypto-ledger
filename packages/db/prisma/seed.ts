import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function seedDimensions() {
  // Legal Entity
  const legalEntity = await prisma.dimension.upsert({
    where: { code: 'legal_entity' },
    update: {},
    create: {
      code: 'legal_entity',
      name: 'Legal Entity',
      description: 'Distinct legal entities within the group',
    },
  });

  await prisma.dimensionValue.createMany({
    data: [
      { dimensionId: legalEntity.id, code: 'LE-US-001', name: 'US Parent Corp' },
      { dimensionId: legalEntity.id, code: 'LE-EU-001', name: 'EU Subsidiary SL' },
      { dimensionId: legalEntity.id, code: 'LE-UK-001', name: 'UK Branch Ltd' },
    ],
    skipDuplicates: true,
  });

  // Cost Center
  const costCenter = await prisma.dimension.upsert({
    where: { code: 'cost_center' },
    update: {},
    create: {
      code: 'cost_center',
      name: 'Cost Center',
      description: 'Organizational cost centers',
    },
  });

  await prisma.dimensionValue.createMany({
    data: [
      { dimensionId: costCenter.id, code: 'CC-SALES', name: 'Sales & Marketing' },
      { dimensionId: costCenter.id, code: 'CC-ENG', name: 'Engineering' },
      { dimensionId: costCenter.id, code: 'CC-OPS', name: 'Operations' },
      { dimensionId: costCenter.id, code: 'CC-ADMIN', name: 'Admin & Finance' },
    ],
    skipDuplicates: true,
  });

  // Project
  const project = await prisma.dimension.upsert({
    where: { code: 'project' },
    update: {},
    create: {
      code: 'project',
      name: 'Project',
      description: 'Projects and initiatives',
    },
  });

  await prisma.dimensionValue.createMany({
    data: [
      { dimensionId: project.id, code: 'PRJ-ALPHA', name: 'Project Alpha' },
      { dimensionId: project.id, code: 'PRJ-BETA', name: 'Project Beta' },
    ],
    skipDuplicates: true,
  });

  // Product
  const product = await prisma.dimension.upsert({
    where: { code: 'product' },
    update: {},
    create: {
      code: 'product',
      name: 'Product',
      description: 'Product lines and services',
    },
  });

  await prisma.dimensionValue.createMany({
    data: [
      { dimensionId: product.id, code: 'PROD-CORE', name: 'Core Platform' },
      { dimensionId: product.id, code: 'PROD-PREMIUM', name: 'Premium Services' },
    ],
    skipDuplicates: true,
  });

  // Wallet
  const wallet = await prisma.dimension.upsert({
    where: { code: 'wallet' },
    update: {},
    create: {
      code: 'wallet',
      name: 'Wallet',
      description: 'Crypto wallet addresses',
    },
  });

  // Geography
  const geography = await prisma.dimension.upsert({
    where: { code: 'geography' },
    update: {},
    create: {
      code: 'geography',
      name: 'Geography',
      description: 'Geographic regions',
    },
  });

  await prisma.dimensionValue.createMany({
    data: [
      { dimensionId: geography.id, code: 'GEO-NA', name: 'North America' },
      { dimensionId: geography.id, code: 'GEO-EU', name: 'Europe' },
      { dimensionId: geography.id, code: 'GEO-APAC', name: 'Asia Pacific' },
    ],
    skipDuplicates: true,
  });

  console.log('✅ Dimensions seeded');
}

async function main() {
  await seedDimensions();
  // ...existing seed code...
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
