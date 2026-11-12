// payment-reconciliation.job.ts — periodically reconcile pending payment orders.
import { logger } from '../lib/logger';
import { reconcilePendingPayments } from '../modules/payments/payments.service';

export async function runPaymentReconciliation(): Promise<void> {
  try {
    await reconcilePendingPayments();
  } catch (err) {
    logger.error({ err }, 'payment reconciliation job failed');
  }
}
