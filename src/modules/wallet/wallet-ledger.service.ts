// wallet-ledger.service.ts — the ONLY path that mutates a wallet balance.
// Invariants enforced here (BPD Appendix B):
//   • balance can never go negative            → checked + DB CHECK backstop
//   • POSTED ledger entries are immutable       → we only ever INSERT, never UPDATE a tx
//   • no double-spend / double-credit           → row lock + unique idempotency_key
import type { Prisma, WalletTransaction } from '@prisma/client';
import { AppError } from '../../common/errors/app-error';
import type { WalletTxType, WalletTxDirection } from '../../shared/constants/wallet';

export interface PostLedgerArgs {
  userId: string;
  type: WalletTxType;
  direction: WalletTxDirection;
  amountPaise: number; // positive magnitude
  idempotencyKey: string;
  referenceType?: string;
  referenceId?: string;
  description?: string;
  createdById?: string | null;
}

/**
 * Post a ledger entry inside an existing interactive transaction.
 * The caller MUST pass a Prisma.TransactionClient (prisma.$transaction(async (tx) => …)).
 * We take a row lock on the user's wallet so concurrent posts for the same user serialize.
 */
export async function postLedgerEntry(
  tx: Prisma.TransactionClient,
  args: PostLedgerArgs,
): Promise<WalletTransaction> {
  if (args.amountPaise <= 0) throw AppError.badRequest('Amount must be positive');

  // Lock the wallet row FIRST so all posts for this user serialize. This makes the
  // idempotency check-then-insert race-free (the second caller sees the committed row).
  const locked = await tx.$queryRaw<{ id: string; balance_paise: bigint }[]>`
    SELECT id, balance_paise FROM wallet_accounts WHERE user_id = ${args.userId}::uuid FOR UPDATE
  `;
  if (locked.length === 0) throw AppError.notFound('Wallet account not found');

  // Idempotency: if this key already posted, return the existing entry unchanged.
  const existing = await tx.walletTransaction.findUnique({ where: { idempotencyKey: args.idempotencyKey } });
  if (existing) return existing;
  const walletId = locked[0]!.id;
  const current = BigInt(locked[0]!.balance_paise);

  const delta = args.direction === 'CREDIT' ? BigInt(args.amountPaise) : -BigInt(args.amountPaise);
  const nextBalance = current + delta;
  if (nextBalance < 0n) {
    throw new AppError(409, 'INSUFFICIENT_FUNDS', 'Insufficient wallet balance');
  }

  const row = await tx.walletTransaction.create({
    data: {
      walletAccountId: walletId,
      userId: args.userId,
      type: args.type,
      direction: args.direction,
      amountPaise: BigInt(args.amountPaise),
      balanceAfterPaise: nextBalance,
      status: 'POSTED',
      idempotencyKey: args.idempotencyKey,
      referenceType: args.referenceType ?? null,
      referenceId: args.referenceId ?? null,
      description: args.description ?? null,
      createdById: args.createdById ?? null,
    },
  });

  await tx.walletAccount.update({
    where: { id: walletId },
    data: { balancePaise: nextBalance, version: { increment: 1 } },
  });

  return row;
}
