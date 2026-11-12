// require-auth.ts — allow only authenticated users with an ACTIVE account.
import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../common/errors/app-error';

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user) {
    next(AppError.unauthorized());
    return;
  }
  if (req.user.accountStatus !== 'ACTIVE') {
    next(AppError.forbidden('Your account is not active'));
    return;
  }
  next();
}
