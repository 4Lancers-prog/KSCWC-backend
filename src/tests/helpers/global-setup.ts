// global-setup.ts — integration tests need a MongoDB REPLICA SET (transactions), e.g.
// TEST_DATABASE_URL=mongodb://127.0.0.1:27017/kscwc_test?replicaSet=rs0  or an Atlas test database.
import 'dotenv/config';

export default function setup(): void {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error('TEST_DATABASE_URL is not set — cannot run integration tests');
  if (!/^mongodb(\+srv)?:\/\//.test(url)) throw new Error('TEST_DATABASE_URL must be a MongoDB URL');
  if (/\/kscwc(\?|$)/.test(url)) throw new Error('TEST_DATABASE_URL points at the main "kscwc" database — use a separate test database');
}
