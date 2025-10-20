import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * System validation script
 * Checks data integrity across the system
 */
async function validateSystem(): Promise<void> {
  console.log('🔍 Crypto-Ledger System Validation\n');
  console.log('=' .repeat(50));

  let errors = 0;

  // 1. Hash Chain Validation
  console.log('\n1️⃣  Validating Hash Chain...');
  try {
    const entries = await prisma.journalEntry.findMany({
      orderBy: { createdAt: 'asc' },
      select: { id: true, hash: true, prevHash: true },
    });

    for (let i = 1; i < entries.length; i++) {
      if (entries[i].prevHash !== entries[i - 1].hash) {
        console.error(`   ❌ Chain broken at entry ${entries[i].id}`);
        errors++;
      }
    }

    if (errors === 0) {
      console.log(`   ✅ Hash chain intact (${entries.length} entries)`);
    }
  } catch (error) {
    console.error('   ❌ Error validating hash chain:', error);
    errors++;
  }

  // 2. Double-Entry Balance
  console.log('\n2️⃣  Validating Double-Entry Balance...');
  try {
    const postings = await prisma.posting.findMany();
    const totalDebit = postings.reduce((sum, p) => sum + p.debit, 0);
    const totalCredit = postings.reduce((sum, p) => sum + p.credit, 0);
    const diff = Math.abs(totalDebit - totalCredit);

    if (diff < 0.01) {
      console.log(`   ✅ Balanced (diff: $${diff.toFixed(4)})`);
      console.log(`      Total Debits:  $${totalDebit.toFixed(2)}`);
      console.log(`      Total Credits: $${totalCredit.toFixed(2)}`);
    } else {
      console.error(`   ❌ Unbalanced by $${diff.toFixed(2)}`);
      errors++;
    }
  } catch (error) {
    console.error('   ❌ Error validating balance:', error);
    errors++;
  }

  // 3. FIFO Lot Integrity
  console.log('\n3️⃣  Validating FIFO Lots...');
  try {
    const lots = await prisma.lot.findMany({
      include: { disposals: true },
    });

    let lotErrors = 0;

    for (const lot of lots) {
      const disposed = lot.disposals.reduce((sum, d) => sum + d.quantityDisposed, 0);
      const expected = lot.quantity - lot.remainingQty;

      if (Math.abs(disposed - expected) > 0.0001) {
        console.error(`   ❌ Lot ${lot.id}: disposed=${disposed}, expected=${expected}`);
        lotErrors++;
      }
    }

    if (lotErrors === 0) {
      console.log(`   ✅ All lots consistent (${lots.length} lots checked)`);
    } else {
      errors += lotErrors;
    }
  } catch (error) {
    console.error('   ❌ Error validating lots:', error);
    errors++;
  }

  // 4. Database Connections
  console.log('\n4️⃣  Validating Database...');
  try {
    await prisma.$queryRaw`SELECT 1`;
    console.log('   ✅ PostgreSQL connection OK');
  } catch (error) {
    console.error('   ❌ PostgreSQL connection failed:', error);
    errors++;
  }

  // Summary
  console.log('\n' + '='.repeat(50));
  if (errors === 0) {
    console.log('✅ All validations passed!');
    process.exit(0);
  } else {
    console.error(`❌ ${errors} validation error(s) found`);
    process.exit(1);
  }
}

validateSystem()
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
