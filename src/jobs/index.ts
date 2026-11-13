// index.ts — register scheduled jobs (node-cron). No-op under tests.
import cron from 'node-cron';
import { isTest } from '../config/env';
import { logger } from '../lib/logger';
import { runCleanup } from './cleanup-expired-files.job';

export function startJobs(): void {
  if (isTest) return;
  // daily at 03:15 IST-ish (server UTC): housekeeping
  cron.schedule('15 3 * * *', () => void runCleanup());
  logger.info('scheduled jobs registered (cleanup)');
}
