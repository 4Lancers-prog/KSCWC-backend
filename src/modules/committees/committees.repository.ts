// committees.repository.ts — committee member data access.
import { CommitteeMember } from '../../db/models';
import { connectDb, toPlain } from '../../lib/db';
import { crud } from '../../lib/crud';

// Display order of committee types (Founders first …), then sortOrder, then name.
const TYPE_ORDER = ['FOUNDER', 'TRUSTEE', 'STATE', 'DISTRICT'];
type Row = { committeeType: string; sortOrder: number; name: string } & Record<string, unknown>;
const byDisplayOrder = (a: Row, b: Row) =>
  TYPE_ORDER.indexOf(a.committeeType) - TYPE_ORDER.indexOf(b.committeeType) ||
  a.sortOrder - b.sortOrder ||
  a.name.localeCompare(b.name);

export async function listPublic(filter: { committeeType?: string; district?: string }) {
  await connectDb();
  const rows = await CommitteeMember.find({
    isActive: true,
    archivedAt: null,
    ...(filter.committeeType ? { committeeType: filter.committeeType } : {}),
    ...(filter.district ? { district: filter.district } : {}),
  }).lean();
  return toPlain<Row[]>(rows).sort(byDisplayOrder);
}

export async function listAdmin() {
  await connectDb();
  return toPlain<Row[]>(await CommitteeMember.find().lean()).sort(byDisplayOrder);
}

/** Save a new manual order in one round trip. */
export async function reorder(order: { id: string; sortOrder: number }[]) {
  await connectDb();
  if (order.length === 0) return;
  await CommitteeMember.bulkWrite(order.map((o) => ({ updateOne: { filter: { _id: o.id }, update: { $set: { sortOrder: o.sortOrder } } } })));
}

const c = crud(CommitteeMember);
export const findById = c.findById;
export const create = c.create;
export const update = c.update;
