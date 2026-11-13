// fid.repository.ts — fid_generations data access (ownership-scoped by the caller).
import { FidGeneration } from '../../db/models';
import { connectDb, toPlain } from '../../lib/db';
import { skip, type PageParams } from '../../common/utils/pagination';

export interface FidGenerationRecord {
  id: string;
  userId: string;
  customerId: string | null;
  status: string;
  chargePaise: number;
  walletTransactionId: string | null;
  fileKey: string | null;
  failureCode: string | null;
  createdAt: Date;
  completedAt: Date | null;
}

const plain = (g: unknown) => (g ? toPlain<FidGenerationRecord>(g) : null);

export async function findByIdempotencyKey(key: string) {
  await connectDb();
  return plain(await FidGeneration.findOne({ idempotencyKey: key }).lean());
}

export async function findById(id: string) {
  await connectDb();
  return plain(await FidGeneration.findById(id).lean());
}

export async function markSucceeded(id: string, fileKey: string) {
  await connectDb();
  return plain(
    await FidGeneration.findByIdAndUpdate(id, { $set: { status: 'SUCCEEDED', fileKey, completedAt: new Date() } }, { new: true }).lean(),
  )!;
}

export async function markFailed(id: string, failureCode: string) {
  await connectDb();
  return plain(
    await FidGeneration.findByIdAndUpdate(id, { $set: { status: 'FAILED', failureCode, completedAt: new Date() } }, { new: true }).lean(),
  );
}

export async function listForUser(userId: string, page: PageParams) {
  await connectDb();
  const where = { userId };
  const [items, total] = await Promise.all([
    FidGeneration.find(where).sort({ createdAt: -1 }).skip(skip(page)).limit(page.limit).lean(),
    FidGeneration.countDocuments(where),
  ]);
  return { items: items.map((g) => plain(g)!), total };
}
