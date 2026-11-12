// logger.ts — pino logger with PII redaction.
import { pino } from 'pino';
import { env, isProd } from '../config/env';

export const logger = pino({
  level: isProd ? 'info' : env.NODE_ENV === 'test' ? 'silent' : 'debug',
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'password',
      '*.password',
      '*.passwordHash',
      '*.mfaSecret',
      '*.aadhaar',
      '*.tokenHash',
    ],
    censor: '[redacted]',
  },
  transport: isProd ? undefined : { target: 'pino-pretty', options: { colorize: true } },
});
