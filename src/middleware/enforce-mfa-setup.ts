// enforce-mfa-setup.ts — when an admin session is flagged mfaSetupRequired (admin MFA is
// mandatory but not yet enrolled), restrict the session to the MFA-setup routes only.
// Mounted on /api/v1 after loadSession, so req.path is relative to that mount (e.g. /auth/me).
import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../common/errors/app-error';

// Paths an MFA-setup-pending admin may still reach, so they can enrol or sign out.
const ALLOWLIST = new Set([
  '/auth/mfa/setup',
  '/auth/mfa/confirm',
  '/auth/me',
  '/auth/logout',
  '/auth/csrf',
]);

export function enforceMfaSetup(req: Request, _res: Response, next: NextFunction): void {
  if (!req.session?.mfaSetupRequired) return next();
  if (ALLOWLIST.has(req.path)) return next();
  throw new AppError(
    403,
    'MFA_SETUP_REQUIRED',
    'Two-factor authentication must be set up before you can continue.',
  );
}
