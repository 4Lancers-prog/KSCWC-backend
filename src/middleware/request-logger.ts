// request-logger.ts — pino-http request logging bound to our logger and request id.
import { pinoHttp } from 'pino-http';
import { logger } from '../lib/logger';

export const requestLogger = pinoHttp({
  logger,
  genReqId: (req, res) => {
    const id = (req as { requestId?: string }).requestId ?? req.headers['x-request-id'];
    if (id) res.setHeader('x-request-id', String(id));
    return String(id ?? '');
  },
  customLogLevel: (_req, res, err) => {
    if (err || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  autoLogging: { ignore: (req) => req.url === '/health/live' || req.url === '/health/ready' },
});
