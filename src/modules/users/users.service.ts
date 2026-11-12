// users.service.ts — admin approval/rejection/suspension with transition guards + audit.
import { AppError } from '../../common/errors/app-error';
import { canTransitionAccount, type AccountStatus } from '../../shared/constants/account-status';
import { writeAudit } from '../audit/audit.service';
import * as repo from './users.repository';

interface Actor {
  id: string;
  requestId?: string;
  ip?: string | null;
}

async function transition(
  targetId: string,
  to: AccountStatus,
  actor: Actor,
  extra: { reason?: string } = {},
) {
  const user = await repo.findRaw(targetId);
  if (!user) throw AppError.notFound('User not found');
  if (user.id === actor.id) throw AppError.badRequest('You cannot change your own account status');
  if (!canTransitionAccount(user.accountStatus, to)) {
    throw AppError.badRequest(`Cannot change account from ${user.accountStatus} to ${to}`);
  }

  const updated = await repo.updateStatus(targetId, {
    accountStatus: to,
    approvedById: to === 'ACTIVE' ? actor.id : undefined,
    approvedAt: to === 'ACTIVE' ? new Date() : undefined,
    rejectedReason: to === 'REJECTED' ? extra.reason ?? null : null,
  });

  await writeAudit({
    actorUserId: actor.id,
    action: `user.${to.toLowerCase()}`,
    entityType: 'user',
    entityId: targetId,
    requestId: actor.requestId,
    ip: actor.ip,
    before: { accountStatus: user.accountStatus },
    after: { accountStatus: to, reason: extra.reason },
  });
  return updated;
}

export const approveUser = (id: string, actor: Actor) => transition(id, 'ACTIVE', actor);
export const rejectUser = (id: string, actor: Actor, reason: string) =>
  transition(id, 'REJECTED', actor, { reason });
export const suspendUser = (id: string, actor: Actor, reason?: string) =>
  transition(id, 'SUSPENDED', actor, { reason });
export const reactivateUser = (id: string, actor: Actor) => transition(id, 'ACTIVE', actor);

export const listUsers = repo.listUsers;
export const getUser = repo.findByIdSafe;
