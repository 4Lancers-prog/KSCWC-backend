// audit.repository.ts — read access for the admin audit log.
import { prisma } from '../../lib/prisma';
import { skip, type PageParams } from '../../common/utils/pagination';

export interface AuditFilter {
  entityType?: string;
  actorUserId?: string;
}

export async function listAuditLogs(filter: AuditFilter, page: PageParams) {
  const where = {
    ...(filter.entityType ? { entityType: filter.entityType } : {}),
    ...(filter.actorUserId ? { actorUserId: filter.actorUserId } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: skip(page),
      take: page.limit,
    }),
    prisma.auditLog.count({ where }),
  ]);
  return { items, total };
}
