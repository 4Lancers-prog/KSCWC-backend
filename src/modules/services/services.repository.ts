// services.repository.ts — service catalogue data access.
import { Service } from '../../db/models';
import { connectDb, toPlain } from '../../lib/db';
import { skip, type PageParams } from '../../common/utils/pagination';

export interface ServiceRecord {
  id: string;
  code: string;
  nameKn: string;
  nameEn: string | null;
  description: string | null;
  isActive: boolean;
  sortOrder: number;
  defaultFeePaise: number | null;
  createdAt: Date;
  updatedAt: Date;
}
const plain = (s: unknown) => (s ? toPlain<ServiceRecord>(s) : null);

export async function listActive() {
  await connectDb();
  return (await Service.find({ isActive: true }).sort({ sortOrder: 1, nameEn: 1 }).lean()).map((s) => plain(s)!);
}

export async function listAll(page: PageParams, includeInactive = true) {
  await connectDb();
  const where = includeInactive ? {} : { isActive: true };
  const [items, total] = await Promise.all([
    Service.find(where).sort({ sortOrder: 1 }).skip(skip(page)).limit(page.limit).lean(),
    Service.countDocuments(where),
  ]);
  return { items: items.map((s) => plain(s)!), total };
}

export async function findById(id: string) {
  await connectDb();
  return plain(await Service.findById(id).lean());
}

export async function create(data: Partial<ServiceRecord> & { code: string; nameKn: string }) {
  await connectDb();
  return plain((await Service.create(data)).toObject())!;
}

export async function update(id: string, data: Partial<ServiceRecord>) {
  await connectDb();
  return plain(await Service.findByIdAndUpdate(id, { $set: data }, { new: true }).lean())!;
}
