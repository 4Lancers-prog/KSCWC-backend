// global-setup.ts — push the Prisma schema to the TEST database once before the suite runs.
import { execSync } from 'node:child_process';
import 'dotenv/config';

export default function setup(): void {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error('TEST_DATABASE_URL is not set — cannot run integration tests');
  // Force the test DB and sync schema without generating a migration.
  execSync('prisma db push --skip-generate --accept-data-loss', {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url },
  });
}
