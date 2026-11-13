// sync-indexes.ts — create/align every collection's indexes (unique UTR, unique phone, etc.).
// Run once after pointing DATABASE_URL at a new database: `npm run db:indexes`.
// The app also builds missing indexes on startup, but this makes it explicit and reports errors.
import { connectDb, disconnectDb } from '../lib/db';
import { ALL_MODELS } from './models';

async function main() {
  await connectDb();
  for (const m of ALL_MODELS) {
    await m.createCollection().catch(() => undefined);
    await m.syncIndexes();
    console.log(`✔ ${m.collection.collectionName}`);
  }
  await disconnectDb();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
