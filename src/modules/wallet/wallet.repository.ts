// wallet.repository.ts — wallet + transaction reads.
import { User, WalletAccount, WalletTransaction } from '../../db/models';
import { connectDb, containsRegex, toPlain } from '../../lib/db';
import { skip, type PageParams } from '../../common/utils/pagination';
import type { WalletTxType } from '../../shared/constants/wallet';

export async function getWalletByUser(userId: string) {
  await connectDb();
  return toPlain<{ id: string; userId: string; balancePaise: number; currency: string; updatedAt: Date } | null>(
    await WalletAccount.findOne({ userId }).lean(),
  );
}

export async function listTransactions(userId: string, page: PageParams, filter: { type?: WalletTxType } = {}) {
  await connectDb();
  const where = { userId, ...(filter.type ? { type: filter.type } : {}) };
  const [items, total] = await Promise.all([
    WalletTransaction.find(where).sort({ createdAt: -1 }).skip(skip(page)).limit(page.limit).lean(),
    WalletTransaction.countDocuments(where),
  ]);
  return { items: toPlain<Record<string, unknown>[]>(items), total };
}

export async function adminListWallets(page: PageParams, search?: string) {
  await connectDb();
  let where: Record<string, unknown> = {};
  if (search) {
    const ids = await User.find({ $or: [{ fullName: containsRegex(search) }, { phoneNormalized: containsRegex(search) }] })
      .distinct('_id');
    where = { userId: { $in: ids } };
  }
  const [wallets, total] = await Promise.all([
    WalletAccount.find(where).sort({ updatedAt: -1 }).skip(skip(page)).limit(page.limit).lean(),
    WalletAccount.countDocuments(where),
  ]);
  const users = await User.find({ _id: { $in: wallets.map((w) => w.userId) } })
    .select('fullName phoneNormalized accountStatus')
    .lean();
  const byId = new Map(users.map((u) => [u._id, toPlain(u)]));
  const items = wallets.map((w) => ({ ...toPlain<Record<string, unknown>>(w), user: byId.get(w.userId) ?? null }));
  return { items, total };
}
