// index.ts — seed runner. Idempotent; never seeds real credentials or demo wallet credit.
import { connectDb, disconnectDb } from '../../lib/db';
import { ALL_MODELS } from '../models';
import { ensureDefaultGovLinks } from '../../modules/government-links/default-links';
import { seedServices } from './services.seed';
import { seedContent } from './content.seed';
import { seedAdmin } from './admin.seed';

async function main(): Promise<void> {
  await connectDb();
  // Make sure collections + unique indexes exist before inserting anything.
  for (const m of ALL_MODELS) {
    await m.createCollection().catch(() => undefined);
    await m.syncIndexes();
  }
  await seedServices();
  await seedContent();
  await seedAdmin();
}

main()
  .then(() => disconnectDb())
  .catch(async (err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    const n = await ensureDefaultGovLinks();
  if (n) console.log(`✔ seeded ${n} government portal links`);
  await disconnectDb();
    process.exit(1);
  });
