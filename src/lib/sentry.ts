// sentry.ts — optional error monitoring. No-op unless SENTRY_DSN is set.
import * as Sentry from '@sentry/node';
import { env } from '../config/env';

export const sentryEnabled = !!env.SENTRY_DSN;

export function initSentry(): void {
  if (!sentryEnabled) return;
  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.NODE_ENV,
    tracesSampleRate: env.NODE_ENV === 'production' ? 0.1 : 0,
  });
}

/** Report a server error with correlation context. Safe to call when Sentry is disabled. */
export function captureException(err: unknown, context?: Record<string, unknown>): void {
  if (!sentryEnabled) return;
  Sentry.captureException(err, context ? { extra: context } : undefined);
}
