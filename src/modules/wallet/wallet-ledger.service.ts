// wallet-ledger.service.ts — the ONLY path that mutates a wallet balance.
// Invariants:
//   • balance can never go negative       → a debit is ONE conditional update:
//                                            { userId, balancePaise ≥ amount } → $inc −amount.
//                                            If the balance is too low nothing matches, nothing changes.
//   • ledger entries are immutable        → we only ever INSERT a transaction, never update one
//   • no double-spend / double-credit     → every post runs in a MongoDB transaction that writes the
//                                            wallet document; two concurrent posts for the same user
//                                            collide on that document (WriteConflict) and the loser is
//                                            retried from scratch by withTransaction(), at which point
//                                            the idempotency check sees the winner's committed entry.
//                                            The unique idempotencyKey index is the final backstop.
import type { ClientSession } from 'mongoose';
import { AppError } from '../../common/errors/app-error';
import { WalletAccount, WalletTransaction } from '../../db/models';
import { toPlain } from '../../lib/db';
import type { WalletTxType, WalletTxDirection } from '../../shared/constants/wallet';

export interface PostLedgerArgs {
  userId: string;
  type: WalletTxType;
  direction: WalletTxDirection;
  amountPaise: number; // positive magnitude, integer paise
  idempotencyKey: string;
  referenceType?: string;
  referenceId?: string;
  description?: string;
  createdById?: string | null;
}

export interface WalletTransactionRecord {
  id: string;
  walletAccountId: string;
  userId: string;
  type: WalletTxType;
  direction: WalletTxDirection;
  amountPaise: number;
  balanceAfterPaise: number;
  status: string;
  idempotencyKey: string;
  referenceType: string | null;
  referenceId: string | null;
  description: string | null;
  createdById: string | null;
  createdAt: Date;
}

/**
 * Post a ledger entry inside an existing transaction (pass the session from withTransaction()).
 * Idempotent: posting the same idempotencyKey again returns the original entry unchanged.
 */
export async function postLedgerEntry(session: ClientSession, args: PostLedgerArgs): Promise<WalletTransactionRecord> {
  if (!Number.isInteger(args.amountPaise) || args.amountPaise <= 0) {
    throw AppError.badRequest('Amount must be a positive whole number of paise');
  }

  // Idempotency: if this key already posted, return the existing entry unchanged.
  const existing = await WalletTransaction.findOne({ idempotencyKey: args.idempotencyKey }).session(session).lean();
  if (existing) return toPlain<WalletTransactionRecord>(existing);

  const delta = args.direction === 'CREDIT' ? args.amountPaise : -args.amountPaise;
  const filter =
    args.direction === 'DEBIT'
      ? { userId: args.userId, balancePaise: { $gte: args.amountPaise } } // never below zero
      : { userId: args.userId };

  const wallet = await WalletAccount.findOneAndUpdate(
    filter,
    { $inc: { balancePaise: delta, version: 1 } },
    { new: true, session },
  ).lean();

  if (!wallet) {
    const exists = await WalletAccount.exists({ userId: args.userId }).session(session);
    if (!exists) throw AppError.notFound('Wallet account not found');
    throw new AppError(409, 'INSUFFICIENT_FUNDS', 'Insufficient wallet balance');
  }

  const [row] = await WalletTransaction.create(
    [
      {
        walletAccountId: wallet._id,
        userId: args.userId,
        type: args.type,
        direction: args.direction,
        amountPaise: args.amountPaise,
        balanceAfterPaise: wallet.balancePaise,
        status: 'POSTED',
        idempotencyKey: args.idempotencyKey,
        referenceType: args.referenceType ?? null,
        referenceId: args.referenceId ?? null,
        description: args.description ?? null,
        createdById: args.createdById ?? null,
      },
    ],
    { session },
  );
  return toPlain<WalletTransactionRecord>(row!.toObject());
}
