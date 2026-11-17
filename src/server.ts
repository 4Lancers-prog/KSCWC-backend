// server.ts — bootstrap: validate env, build app, listen, graceful shutdown.
import { env } from './config/env';
import { logger } from './lib/logger';
import { connectDb, disconnectDb } from './lib/db';
import { ensureDefaultGovLinks } from './modules/government-links/default-links';
import { ensureDefaultCategories } from './modules/categories/categories.service';
import { buildApp } from './app';
import { startJobs } from './jobs';
import { storageBackendName } from './lib/storage';
import { initSentry } from './lib/sentry';

async function main(): Promise<void> {
  initSentry();
  await connectDb(); // fail fast if MongoDB is unreachable
  await ensureDefaultGovLinks().catch((e) => logger.warn({ err: e }, 'could not load default government links'));
  await ensureDefaultCategories().catch((e) => logger.warn({ err: e }, 'could not set up categories'));
  const app = buildApp();
  const server = app.listen(env.API_PORT, () => {
    logger.info(`KSCWC API listening on http://localhost:${env.API_PORT} (${env.NODE_ENV}); storage=${storageBackendName}`);
    startJobs();
  });

  const shutdown = async (signal: string) => {
    logger.info(`${signal} received, shutting down…`);
    server.close(() => undefined);
    await disconnectDb().catch(() => undefined);
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err) => {
  logger.error({ err }, 'fatal startup error');
  process.exit(1);
});
