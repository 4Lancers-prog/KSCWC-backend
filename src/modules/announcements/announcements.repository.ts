// announcements.repository.ts — announcements data access.
import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { skip, type PageParams } from '../../common/utils/pagination';

/** Public: only PUBLISHED, within publish/expiry window. */
export function listPublic() {
  const now = new Date();
  return prisma.announcement.findMany({
    where: {
      status: 'PUBLISHED',
      OR: [{ publishAt: null }, { publishAt: { lte: now } }],
      AND: [{ OR: [{ expiresAt: null }, { expiresAt: { gte: now } }] }],
    },
    orderBy: [{ sortOrder: 'asc' }, { publishAt: 'desc' }],
  });
}

export async function listAdmin(page: PageParams) {
  const [items, total] = await Promise.all([
    prisma.announcement.findMany({ orderBy: { createdAt: 'desc' }, skip: skip(page), take: page.limit }),
    prisma.announcement.count(),
  ]);
  return { items, total };
}

export const findById = (id: string) => prisma.announcement.findUnique({ where: { id } });
export const create = (data: Prisma.AnnouncementCreateInput) => prisma.announcement.create({ data });
export const update = (id: string, data: Prisma.AnnouncementUpdateInput) =>
  prisma.announcement.update({ where: { id }, data });
