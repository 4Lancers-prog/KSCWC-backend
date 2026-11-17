// index.ts — seed runner. Idempotent; never seeds real credentials or demo wallet credit.
import { connectDb, disconnectDb } from '../../lib/db';
import { ALL_MODELS } from '../models';
import { ensureDefaultGovLinks } from '../../modules/government-links/default-links';
import { ensureDefaultCategories } from '../../modules/categories/categories.service';
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
  const n = await ensureDefaultGovLinks();
   
  if (n) console.log(`✔ seeded ${n} government portal links`);
  await ensureDefaultCategories();
}

main()
  .then(() => disconnectDb())
  .catch(async (err) => {
     
    console.error(err);
    await disconnectDb().catch(() => undefined);
    process.exit(1);
  });
