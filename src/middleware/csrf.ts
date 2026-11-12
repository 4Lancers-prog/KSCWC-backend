// csrf.ts — double-submit-cookie CSRF protection (SameSite=lax + non-HttpOnly token cookie).
// Safe methods are exempt. Mutating methods must send the token in the x-csrf-token header,
// matching the value in the kscwc.csrf cookie. A cross-site attacker cannot read that cookie,
// so cannot forge the header.
import crypto from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../common/errors/app-error';
import { CSRF_COOKIE_NAME, CSRF_HEADER_NAME } from '../config/constants';
import { isProd } from '../config/env';

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);

export function issueCsrfToken(_req: Request, res: Response): string {
  const token = crypto.randomBytes(32).toString('hex');
  res.cookie(CSRF_COOKIE_NAME, token, {
    httpOnly: false, // the SPA must read it to echo in the header
    sameSite: 'lax',
    secure: isProd,
    path: '/',
  });
  return token;
}

function timingSafeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

export function csrfProtection(req: Request, _res: Response, next: NextFunction): void {
  if (SAFE.has(req.method)) return next();
  const cookieToken = req.cookies?.[CSRF_COOKIE_NAME];
  const headerToken = req.header(CSRF_HEADER_NAME);
  if (!cookieToken || !headerToken || !timingSafeEqual(String(cookieToken), String(headerToken))) {
    return next(new AppError(403, 'CSRF_FAILED', 'Invalid or missing CSRF token'));
  }
  next();
}
