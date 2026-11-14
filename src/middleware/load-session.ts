// load-session.ts — hydrate req.user from the session's userId on every request.
// Operators additionally must hold the account's ONE active login (device rules); if another
// device took over or an admin ended it, this session is ended and the request is anonymous.
import type { Request, Response, NextFunction } from 'express';
import { findById } from '../modules/auth/auth.repository';
import { checkActiveLogin } from '../modules/devices/device-policy';

export async function loadSession(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const userId = req.session?.userId;
  if (!userId) return next();
  const user = await findById(userId);
  if (!user) {
    // stale session -> drop it
    req.session.destroy(() => undefined);
    return next();
  }
  if (user.role === 'USER' && (await checkActiveLogin(user.id, req.sessionID, user.activeSession)) === 'ended') {
    req.sessionEnded = true;
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
