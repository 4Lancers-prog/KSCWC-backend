// index.ts — seed runner. Idempotent; never seeds real credentials or demo wallet credit.
import { prisma } from '../../lib/prisma';
import { seedServices } from './services.seed';
import { seedContent } from './content.seed';
import { seedAdmin } from './admin.seed';

async function main(): Promise<void> {
  await seedServices();
  await seedContent();
  await seedAdmin();
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
