// auth.routes.ts — /api/v1/auth/* routes.
import { Router } from 'express';
import multer from 'multer';
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
  changePasswordSchema,
  enableMfaSchema,
  type RegisterInput,
  type LoginInput,
} from '../../shared/schemas/auth.schema';
import { isProd } from '../../config/env';
import * as authRepo from './auth.repository';
import { releaseActiveLogin } from '../devices/device-policy';
import { AppError } from '../../common/errors/app-error';
import * as auth from './auth.service';

const router = Router();
const logoUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024, files: 2 } });
const ctxOf = (req: import('express').Request) => ({ requestId: req.requestId, ip: req.ip });

// Issue a CSRF token (SPA calls this on load, then echoes it in x-csrf-token).
router.get('/auth/csrf', (req, res) => {
  const token = issueCsrfToken(req, res);
  res.json({ csrfToken: token });
});

// Public: the payment scanner shown on the last registration step (visitor isn't logged in yet).
router.get(
  '/auth/registration-scanner',
  asyncHandler(async (_req, res) => res.json(await auth.getRegistrationScanner())),
);

router.get(
  '/auth/registration-scanner/image',
  asyncHandler(async (_req, res) => {
    const { buffer, mimeType } = await auth.getRegistrationScannerImage();
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Cache-Control', 'public, max-age=60');
    res.send(buffer);
  }),
);

router.post(
  '/auth/register',
  publicSubmitRateLimit,
  // optional centre logo + optional payment screenshot, both sent with the form
  logoUpload.fields([
    { name: 'logo', maxCount: 1 },
    { name: 'paymentProof', maxCount: 1 },
  ]),
  validate(registerSchema),
  asyncHandler(async (req, res) => {
    const files = req.files as Record<string, Express.Multer.File[]> | undefined;
    const user = await auth.register(valid<RegisterInput>(req), ctxOf(req), files?.logo?.[0], files?.paymentProof?.[0]);
    res.status(201).json({ user, message: 'Registration received. An admin will review your account.' });
  }),
);

router.post(
  '/auth/login',
  loginRateLimit,
  validate(loginSchema),
  asyncHandler(async (req, res) => {
    const { user, mfaSetupRequired } = await auth.login(valid<LoginInput>(req), req, ctxOf(req));
    res.json({ user, mfaSetupRequired });
  }),
);

router.post(
  '/auth/logout',
  asyncHandler(async (req, res) => {
    if (req.user?.role === 'USER') await releaseActiveLogin(req.user.id, req.sessionID);
    await auth.logout(req.session);
    res.clearCookie('kscwc.sid');
    res.json({ ok: true });
  }),
);

router.get(
  '/auth/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const u = await authRepo.findById(req.user!.id);
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
  '/auth/change-password',
  requireAuth,
  loginRateLimit, // wrong-current-password guesses count like login attempts
  validate(changePasswordSchema),
  asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = valid<{ currentPassword: string; newPassword: string }>(req);
    await auth.changePassword(req.user!.id, req.sessionID, currentPassword, newPassword, ctxOf(req));
    res.json({ ok: true });
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
    const u = await authRepo.findById(req.user!.id);
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
    const u = await authRepo.findById(req.user!.id);
    if (!u) throw AppError.unauthorized();
    await auth.confirmMfa(u, valid<{ token: string }>(req).token, ctxOf(req));
    req.session.mfaSetupRequired = false; // enrolment complete — lift the restriction
    res.json({ ok: true });
  }),
);

export default router;
