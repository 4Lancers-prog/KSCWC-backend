// audit.repository.ts — read access for the admin audit log.
import { AuditLog } from '../../db/models';
import { connectDb, toPlain } from '../../lib/db';
import { skip, type PageParams } from '../../common/utils/pagination';

export interface AuditFilter {
  entityType?: string;
  actorUserId?: string;
}

export async function listAuditLogs(filter: AuditFilter, page: PageParams) {
  await connectDb();
  const where = {
    ...(filter.entityType ? { entityType: filter.entityType } : {}),
    ...(filter.actorUserId ? { actorUserId: filter.actorUserId } : {}),
  };
  const [items, total] = await Promise.all([
    AuditLog.find(where).sort({ createdAt: -1 }).skip(skip(page)).limit(page.limit).lean(),
    AuditLog.countDocuments(where),
  ]);
  return { items: toPlain<Record<string, unknown>[]>(items), total };
}
