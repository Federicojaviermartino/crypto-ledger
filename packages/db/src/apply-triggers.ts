
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function run() {
  const sqlPath = resolve(process.cwd(), 'packages/db/prisma/triggers.sql');
  const sql = readFileSync(sqlPath, 'utf-8');
  await prisma.$executeRawUnsafe(sql);
  console.log('Constraint trigger applied.');
}

run().finally(async () => prisma.$disconnect());
