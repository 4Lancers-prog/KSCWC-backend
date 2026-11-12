// security.ts — helmet security headers + CORS allowlist (credentialed).
import helmet from 'helmet';
import cors from 'cors';
import type { RequestHandler } from 'express';
import { corsAllowlist } from '../config/env';
import { CSRF_HEADER_NAME } from '../config/constants';

export const securityHeaders: RequestHandler = helmet({
  // API serves JSON + PDF streams; CSP is enforced on the frontend origin.
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: 'same-site' },
});

export const corsMiddleware: RequestHandler = cors({
  origin(origin, cb) {
    // allow same-origin / server-to-server (no origin) and allowlisted browser origins
    if (!origin || corsAllowlist.includes(origin)) return cb(null, true);
    cb(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', CSRF_HEADER_NAME, 'Idempotency-Key', 'x-request-id'],
  exposedHeaders: ['x-request-id'],
});
