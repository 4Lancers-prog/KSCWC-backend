// customers.repository.ts — customer data access (always ownership-scoped by the caller).
import type { ClientSession } from 'mongoose';
import { Customer, CustomerStatusHistory } from '../../db/models';
import { connectDb, containsRegex, toPlain } from '../../lib/db';
import { skip, type PageParams } from '../../common/utils/pagination';
import type { CustomerStatus } from '../../shared/constants/customer-status';

export interface CustomerRecord {
  id: string;
  ownerUserId: string;
  serviceId: string;
  fullName: string;
  mobileNormalized: string;
  referenceCode: string | null;
  feePaise: number | null;
  status: CustomerStatus;
  notes: string | null;
  createdById: string | null;
  updatedById: string | null;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  service: { id: string; code: string; nameKn: string; nameEn: string | null } | null;
  owner: { id: string; fullName: string; phoneNormalized: string; centreName: string | null } | null;
}

export type CustomerFilter = Record<string, unknown>;

// The API returns each customer with its service and owning operator embedded.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function withRelations(q: any): any {
  return q
    .populate({ path: 'service', select: 'code nameKn nameEn' })
    .populate({ path: 'owner', select: 'fullName phoneNormalized centreName' });
}
const plain = (c: unknown) => (c ? toPlain<CustomerRecord>(c) : null);

export async function create(data: Omit<Partial<CustomerRecord>, 'id' | 'service' | 'owner'>, session?: ClientSession) {
  await connectDb();
  const [doc] = await Customer.create([data], { session });
  return (await findById(doc!._id, session))!;
}

export async function findById(id: string, session?: ClientSession): Promise<CustomerRecord | null> {
  await connectDb();
  return plain(await withRelations(Customer.findOne({ _id: id, deletedAt: null }).session(session ?? null)).lean());
}

export function buildWhere(filter: {
  ownerUserId?: string;
  status?: CustomerStatus;
  serviceId?: string;
  search?: string;
  from?: Date;
  to?: Date;
}): CustomerFilter {
  return {
    deletedAt: null,
    ...(filter.ownerUserId ? { ownerUserId: filter.ownerUserId } : {}),
    ...(filter.status ? { status: filter.status } : {}),
    ...(filter.serviceId ? { serviceId: filter.serviceId } : {}),
    ...(filter.from || filter.to
      ? { createdAt: { ...(filter.from ? { $gte: filter.from } : {}), ...(filter.to ? { $lte: filter.to } : {}) } }
      : {}),
    ...(filter.search
      ? {
          $or: [
            { fullName: containsRegex(filter.search) },
            { mobileNormalized: containsRegex(filter.search) },
            { referenceCode: containsRegex(filter.search) },
          ],
        }
      : {}),
  };
}

export async function list(where: CustomerFilter, page: PageParams): Promise<{ items: CustomerRecord[]; total: number }> {
  await connectDb();
  const [items, total] = await Promise.all([
    withRelations(Customer.find(where).sort({ createdAt: -1 }).skip(skip(page)).limit(page.limit)).lean(),
    Customer.countDocuments(where),
  ]);
  return { items: items.map((c: unknown) => plain(c)!), total };
}

/** For CSV export: all matching rows (capped by caller). */
export async function listAll(where: CustomerFilter, cap = 10000): Promise<CustomerRecord[]> {
  await connectDb();
  const items = await withRelations(Customer.find(where).sort({ createdAt: -1 }).limit(cap)).lean();
  return items.map((c: unknown) => plain(c)!);
}

export async function countRecentDuplicates(ownerUserId: string, mobile: string, serviceId: string, since: Date) {
  await connectDb();
  return Customer.countDocuments({ ownerUserId, mobileNormalized: mobile, serviceId, deletedAt: null, createdAt: { $gte: since } });
}

export async function update(id: string, data: Record<string, unknown>, session?: ClientSession) {
  await connectDb();
  await Customer.updateOne({ _id: id }, { $set: data }, { session });
  return (await findById(id, session))!;
}

export async function addStatusHistory(
  session: ClientSession | undefined,
  data: { customerId: string; oldStatus: CustomerStatus | null; newStatus: CustomerStatus; changedById: string | null; reason: string | null },
) {
  await CustomerStatusHistory.create([data], { session });
}

export async function listStatusHistory(customerId: string) {
  await connectDb();
  return toPlain<Record<string, unknown>[]>(await CustomerStatusHistory.find({ customerId }).sort({ createdAt: 1 }).lean());
}
