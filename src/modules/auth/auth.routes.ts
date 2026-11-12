// auth.routes.ts — /api/v1/auth/* routes.
import { Router } from 'express';
import { asyncHandler } from '../../middleware/async-handler';
import { validate, valid } from '../../middleware/validate';
import { requireAuth } from '../../middleware/require-auth';
import { loginRateLimit, publicSubmitRateLimit } from '../../middleware/rate-limit';
import { issueCsrfToken } from '../../middleware/csrf';
import {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  enableMfaSchema,
  type RegisterInput,
  type LoginInput,
} from '../../shared/schemas/auth.schema';
import { isProd } from '../../config/env';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../common/errors/app-error';
import * as auth from './auth.service';

const router = Router();
const ctxOf = (req: import('express').Request) => ({ requestId: req.requestId, ip: req.ip });

// Issue a CSRF token (SPA calls this on load, then echoes it in x-csrf-token).
router.get('/auth/csrf', (req, res) => {
  const token = issueCsrfToken(req, res);
  res.json({ csrfToken: token });
});

router.post(
  '/auth/register',
  publicSubmitRateLimit,
  validate(registerSchema),
  asyncHandler(async (req, res) => {
    const user = await auth.register(valid<RegisterInput>(req), ctxOf(req));
    res.status(201).json({ user, message: 'Registration received. An admin will review your account.' });
  }),
);

router.post(
  '/auth/login',
  loginRateLimit,
  validate(loginSchema),
  asyncHandler(async (req, res) => {
    const user = await auth.login(valid<LoginInput>(req), req.session, ctxOf(req));
    res.json({ user, mfaSetupRequired: !!req.session.mfaSetupRequired });
  }),
);

router.post(
  '/auth/logout',
  asyncHandler(async (req, res) => {
    await auth.logout(req.session);
    res.clearCookie('kscwc.sid');
    res.json({ ok: true });
  }),
);

router.get(
  '/auth/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const u = await prisma.user.findUnique({ where: { id: req.user!.id } });
    if (!u) throw AppError.unauthorized();
    res.json({ user: auth.toSessionUser(u), mfaSetupRequired: !!req.session.mfaSetupRequired });
  }),
);

router.post(
  '/auth/forgot-password',
  loginRateLimit,
  validate(forgotPasswordSchema),
  asyncHandler(async (req, res) => {
    const token = await auth.forgotPassword(valid<{ phone: string }>(req).phone, ctxOf(req));
    // Never reveal whether the account exists. In non-prod, return the token to ease testing.
    res.json({ ok: true, ...(isProd ? {} : { devToken: token }) });
  }),
);

router.post(
  '/auth/reset-password',
  validate(resetPasswordSchema),
  asyncHandler(async (req, res) => {
    const { token, password } = valid<{ token: string; password: string }>(req);
    await auth.resetPassword(token, password, ctxOf(req));
    res.json({ ok: true });
  }),
);

// ── MFA enrolment (admins) ──
router.post(
  '/auth/mfa/setup',
  requireAuth,
  asyncHandler(async (req, res) => {
    const u = await prisma.user.findUnique({ where: { id: req.user!.id } });
    if (!u) throw AppError.unauthorized();
    const { secret, otpauthUrl } = await auth.beginMfaEnrolment(u);
    res.json({ secret, otpauthUrl });
  }),
);

router.post(
  '/auth/mfa/confirm',
  requireAuth,
  validate(enableMfaSchema),
  asyncHandler(async (req, res) => {
    const u = await prisma.user.findUnique({ where: { id: req.user!.id } });
    if (!u) throw AppError.unauthorized();
    await auth.confirmMfa(u, valid<{ token: string }>(req).token, ctxOf(req));
    req.session.mfaSetupRequired = false; // enrolment complete — lift the restriction
    res.json({ ok: true });
  }),
);

export default router;
