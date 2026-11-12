// index.ts — register scheduled jobs (node-cron). No-op under tests.
import cron from 'node-cron';
import { isTest } from '../config/env';
import { logger } from '../lib/logger';
import { runPaymentReconciliation } from './payment-reconciliation.job';
import { runCleanup } from './cleanup-expired-files.job';

export function startJobs(): void {
  if (isTest) return;
  // every 10 minutes: reconcile pending payments
  cron.schedule('*/10 * * * *', () => void runPaymentReconciliation());
  // daily at 03:15 IST-ish (server UTC): housekeeping
  cron.schedule('15 3 * * *', () => void runCleanup());
  logger.info('scheduled jobs registered (reconciliation, cleanup)');
}
