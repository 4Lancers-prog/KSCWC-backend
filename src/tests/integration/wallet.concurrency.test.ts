// wallet.concurrency.test.ts — ledger safety: no negative balance under concurrency, idempotency (AC-08).
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { WalletAccount, WalletTransaction } from '../../db/models';
import { withTransaction } from '../../lib/db';
import { resetDb, createUser } from '../helpers/test-db';
import { postLedgerEntry } from '../../modules/wallet/wallet-ledger.service';

async function credit(userId: string, amountPaise: number, key: string) {
  return withTransaction((tx) =>
    postLedgerEntry(tx, { userId, type: 'TOPUP', direction: 'CREDIT', amountPaise, idempotencyKey: key }),
  );
}
async function debit(userId: string, amountPaise: number, key: string) {
  return withTransaction((tx) =>
    postLedgerEntry(tx, { userId, type: 'CARD_CHARGE', direction: 'DEBIT', amountPaise, idempotencyKey: key }),
  );
}
const balanceOf = async (userId: string) =>
  (await WalletAccount.findOne({ userId }).orFail().lean()).balancePaise;

beforeAll(() => {});
beforeEach(async () => {
  await resetDb();
});

describe('wallet ledger', () => {
  it('posts credits and debits and tracks balance_after', async () => {
    const u = await createUser({ phone: '9700000001' });
    await credit(u.id, 10000, 'c1');
    const d = await debit(u.id, 2500, 'd1');
    expect(Number(d.balanceAfterPaise)).toBe(7500);
    expect(await balanceOf(u.id)).toBe(7500);
  });

  it('is idempotent: the same key never double-posts', async () => {
    const u = await createUser({ phone: '9700000002' });
    await credit(u.id, 10000, 'topup:same');
    await credit(u.id, 10000, 'topup:same'); // replay
    expect(await balanceOf(u.id)).toBe(10000);
    expect(await WalletTransaction.countDocuments({ userId: u.id })).toBe(1);
  });

  it('rejects a debit that would go negative', async () => {
    const u = await createUser({ phone: '9700000003' });
    await credit(u.id, 400, 'c');
    await expect(debit(u.id, 500, 'd')).rejects.toMatchObject({ code: 'INSUFFICIENT_FUNDS' });
    expect(await balanceOf(u.id)).toBe(400);
  });

  it('concurrent spends cannot overspend (AC-08)', async () => {
    const u = await createUser({ phone: '9700000004' });
    await credit(u.id, 10000, 'seed'); // ₹100

    // Fire 6 concurrent ₹30 debits; only 3 can succeed (₹90), balance must stay ≥ 0.
    const results = await Promise.allSettled(
      Array.from({ length: 6 }, (_, i) => debit(u.id, 3000, `d${i}`)),
    );
    const ok = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.filter((r) => r.status === 'rejected').length;

    expect(ok).toBe(3);
    expect(failed).toBe(3);
    expect(await balanceOf(u.id)).toBe(1000);
    // balance never recorded below zero on any posted row
    const min = await WalletTransaction.findOne({ userId: u.id }).sort({ balanceAfterPaise: 1 }).lean();
    expect(min!.balanceAfterPaise).toBeGreaterThanOrEqual(0);
  });

  it('concurrent replays of the same key post once (double click)', async () => {
    const u = await createUser({ phone: '9700000005' });
    await credit(u.id, 10000, 'seed');
    const results = await Promise.allSettled(Array.from({ length: 5 }, () => debit(u.id, 500, 'same-click')));
    expect(results.every((r) => r.status === 'fulfilled')).toBe(true);
    expect(await balanceOf(u.id)).toBe(9500);
    expect(await WalletTransaction.countDocuments({ userId: u.id, type: 'CARD_CHARGE' })).toBe(1);
  });
});
