// wallet.service.ts — wallet reads + admin ledger adjustments (via the ledger service only).
import { nanoid } from 'nanoid';
import { User } from '../../db/models';
import { connectDb, withTransaction } from '../../lib/db';
import { AppError } from '../../common/errors/app-error';
import { resolvePage, paginate } from '../../common/utils/pagination';
import type { WalletTxType } from '../../shared/constants/wallet';
import { postLedgerEntry } from './wallet-ledger.service';
import { writeAudit } from '../audit/audit.service';
import * as repo from './wallet.repository';

export async function getWallet(userId: string) {
  const wallet = await repo.getWalletByUser(userId);
  if (!wallet) throw AppError.notFound('Wallet not found');
  return { balancePaise: Number(wallet.balancePaise), currency: wallet.currency };
}

export async function listTransactions(
  userId: string,
  q: { page?: number; limit?: number; type?: WalletTxType },
) {
  const page = resolvePage(q.page, q.limit);
  const { items, total } = await repo.listTransactions(userId, page, { type: q.type });
  const mapped = (items as Array<Record<string, any>>).map((t) => ({
    id: t.id,
    type: t.type,
    direction: t.direction,
    amountPaise: Number(t.amountPaise),
    balanceAfterPaise: Number(t.balanceAfterPaise),
    status: t.status,
    description: t.description,
    referenceType: t.referenceType,
    createdAt: t.createdAt,
  }));
  return paginate(mapped, total, page);
}

export async function adminAdjust(
  targetUserId: string,
  input: { amountPaise: number; direction: 'CREDIT' | 'DEBIT'; reason: string },
  actor: { id: string; requestId?: string; ip?: string | null },
) {
  await connectDb();
  const target = await User.exists({ _id: targetUserId });
  if (!target) throw AppError.notFound('User not found');

  const type: WalletTxType = input.direction === 'CREDIT' ? 'ADMIN_CREDIT' : 'ADMIN_DEBIT';
  const txn = await withTransaction((session) =>
    postLedgerEntry(session, {
      userId: targetUserId,
      type,
      direction: input.direction,
      amountPaise: input.amountPaise,
      idempotencyKey: `adminadj:${nanoid(20)}`,
      referenceType: 'admin_adjustment',
      description: input.reason,
      createdById: actor.id,
    }),
  );

  await writeAudit({
    actorUserId: actor.id,
    action: 'wallet.admin_adjust',
    entityType: 'wallet_transaction',
    entityId: txn.id,
    requestId: actor.requestId,
    ip: actor.ip,
    after: { targetUserId, direction: input.direction, amountPaise: input.amountPaise, reason: input.reason },
  });
  return { id: txn.id, balanceAfterPaise: Number(txn.balanceAfterPaise) };
}

export const adminListWallets = repo.adminListWallets;
