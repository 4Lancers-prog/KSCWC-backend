// app.ts — build the Express application: middleware order, routes, 404 + error handler.
import './middleware/types'; // load Request augmentation
import express, { type Express } from 'express';
import cookieParser from 'cookie-parser';
import { requestContext } from './middleware/request-context';
import { requestLogger } from './middleware/request-logger';
import { securityHeaders, corsMiddleware } from './middleware/security';
import { sessionMiddleware } from './lib/session-store';
import { loadSession } from './middleware/load-session';
import { csrfProtection } from './middleware/csrf';
import { enforceMfaSetup } from './middleware/enforce-mfa-setup';
import { globalRateLimit } from './middleware/rate-limit';
import { errorHandler } from './middleware/error-handler';
import { notFound } from './middleware/not-found';
import { asyncHandler } from './middleware/async-handler';
import mongoose from 'mongoose';
import { proxyClientIp } from './middleware/proxy-client-ip';
import { connectDb } from './lib/db';

import authRoutes from './modules/auth/auth.routes';
import usersRoutes from './modules/users/users.routes';
import auditRoutes from './modules/audit/audit.routes';
import servicesRoutes from './modules/services/services.routes';
import customersRoutes from './modules/customers/customers.routes';
import reportsRoutes from './modules/reports/reports.routes';
import walletRoutes from './modules/wallet/wallet.routes';
import manualTopupRoutes from './modules/manual-topup/manual-topup.routes';
import announcementsRoutes from './modules/announcements/announcements.routes';
import committeesRoutes from './modules/committees/committees.routes';
import governmentLinksRoutes from './modules/government-links/government-links.routes';
import documentsRoutes from './modules/documents/documents.routes';
import applicationsRoutes from './modules/applications/applications.routes';
import meRoutes from './modules/me/me.routes';
import adminOverviewRoutes from './modules/admin-overview/admin-overview.routes';

export function buildApp(): Express {
  const app = express();

  app.set('trust proxy', 1); // behind a reverse proxy in prod (secure cookies, correct req.ip)

  app.use(proxyClientIp); // real visitor IP when requests come through our Cloudflare Worker
  app.use(requestContext);
  app.use(requestLogger);
  app.use(securityHeaders);
  app.use(corsMiddleware);
  app.use(cookieParser());


  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: false }));

  app.use(sessionMiddleware);
  app.use(asyncHandler(loadSession));
  app.use(csrfProtection);
  app.use(globalRateLimit);

  // health
  app.get('/health/live', (_req, res) => res.json({ status: 'ok' }));
  app.get(
    '/health/ready',
    asyncHandler(async (_req, res) => {
      await connectDb();
      await mongoose.connection.db!.admin().ping();
      res.json({ status: 'ready' });
    }),
  );

  // Admins with mandatory-but-unenrolled MFA are restricted to the setup routes.
  app.use('/api/v1', enforceMfaSetup);

  // API v1
  app.use('/api/v1', authRoutes);
  app.use('/api/v1', usersRoutes);
  app.use('/api/v1', servicesRoutes);
  app.use('/api/v1', customersRoutes);
  app.use('/api/v1', reportsRoutes);
  app.use('/api/v1', walletRoutes);
  app.use('/api/v1', manualTopupRoutes);
  app.use('/api/v1', announcementsRoutes);
  app.use('/api/v1', committeesRoutes);
  app.use('/api/v1', governmentLinksRoutes);
  app.use('/api/v1', documentsRoutes);
  app.use('/api/v1', applicationsRoutes);
  app.use('/api/v1', auditRoutes);
  app.use('/api/v1', meRoutes);
  app.use('/api/v1', adminOverviewRoutes);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
