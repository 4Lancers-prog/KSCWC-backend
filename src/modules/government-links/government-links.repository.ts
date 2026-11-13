// government-links.repository.ts — government link data access.
import { GovernmentLink } from '../../db/models';
import { connectDb, toPlain } from '../../lib/db';
import { crud } from '../../lib/crud';

export async function listPublic() {
  await connectDb();
  return toPlain<Record<string, unknown>[]>(await GovernmentLink.find({ isActive: true }).sort({ sortOrder: 1, title: 1 }).lean());
}
export async function listAdmin() {
  await connectDb();
  return toPlain<Record<string, unknown>[]>(await GovernmentLink.find().sort({ sortOrder: 1 }).lean());
}

const c = crud(GovernmentLink);
export const findById = c.findById;
export const create = c.create;
export const update = c.update;
