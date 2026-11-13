// announcements.repository.ts — announcements data access.
import { Announcement } from '../../db/models';
import { connectDb, toPlain } from '../../lib/db';
import { crud } from '../../lib/crud';
import { skip, type PageParams } from '../../common/utils/pagination';

/** Public: only PUBLISHED, within publish/expiry window. */
export async function listPublic() {
  await connectDb();
  const now = new Date();
  const rows = await Announcement.find({
    status: 'PUBLISHED',
    $and: [
      { $or: [{ publishAt: null }, { publishAt: { $lte: now } }] },
      { $or: [{ expiresAt: null }, { expiresAt: { $gte: now } }] },
    ],
  })
    .sort({ sortOrder: 1, publishAt: -1 })
    .lean();
  return toPlain<Record<string, unknown>[]>(rows);
}

export async function listAdmin(page: PageParams) {
  await connectDb();
  const [items, total] = await Promise.all([
    Announcement.find().sort({ createdAt: -1 }).skip(skip(page)).limit(page.limit).lean(),
    Announcement.countDocuments(),
  ]);
  return { items: toPlain<Record<string, unknown>[]>(items), total };
}

const c = crud(Announcement);
export const findById = c.findById;
export const create = c.create;
export const update = c.update;
