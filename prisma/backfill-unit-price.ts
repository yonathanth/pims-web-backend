import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Starting backfill of unitPrice on transactions...');

  // Get all sale transactions without unitPrice
  const transactions = await prisma.transaction.findMany({
    where: {
      unitPrice: null,
      transactionType: 'sale',
    },
    include: {
      batch: true,
    },
  });

  console.log(`Found ${transactions.length} transactions to update`);

  if (transactions.length === 0) {
    console.log('No transactions need backfilling.');
    return;
  }

  let updated = 0;
  let errors = 0;

  for (const tx of transactions) {
    try {
      await prisma.transaction.update({
        where: { id: tx.id },
        data: { unitPrice: tx.batch.unitPrice },
      });
      updated++;

      if (updated % 100 === 0) {
        console.log(`Progress: ${updated}/${transactions.length} transactions updated`);
      }
    } catch (error) {
      console.error(`Failed to update transaction ${tx.id}:`, error);
      errors++;
    }
  }

  console.log('');
  console.log('=== Backfill Complete ===');
  console.log(`Total transactions processed: ${transactions.length}`);
  console.log(`Successfully updated: ${updated}`);
  console.log(`Errors: ${errors}`);
}

main()
  .catch((e) => {
    console.error('Backfill failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

