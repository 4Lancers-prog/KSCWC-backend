// load-session.ts — hydrate req.user from the session's userId on every request.
import type { Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';

export async function loadSession(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const userId = req.session?.userId;
  if (!userId) return next();
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    // stale session -> drop it
    req.session.destroy(() => undefined);
    return next();
  }
  req.user = {
    id: user.id,
    role: user.role,
    accountStatus: user.accountStatus,
    fullName: user.fullName,
    phone: user.phoneNormalized,
    email: user.emailNormalized,
    centreName: user.centreName,
    cscId: user.cscId,
    mfaEnabled: user.mfaEnabled,
  };
  next();
}
