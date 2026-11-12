// require-role.ts — role and permission guards (server-side; UI hiding is not access control).
import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../common/errors/app-error';
import type { Role } from '../shared/constants/roles';
import { roleHas, type Permission } from '../config/permissions';

export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) return next(AppError.unauthorized());
    if (req.user.accountStatus !== 'ACTIVE') return next(AppError.forbidden('Account not active'));
    if (!roles.includes(req.user.role)) return next(AppError.forbidden());
    next();
  };
}

export function requirePermission(permission: Permission) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) return next(AppError.unauthorized());
    if (req.user.accountStatus !== 'ACTIVE') return next(AppError.forbidden('Account not active'));
    if (!roleHas(req.user.role, permission)) return next(AppError.forbidden());
    next();
  };
}
