// fid.repository.ts — fid_generations data access (ownership-scoped by the caller).
import { prisma } from '../../lib/prisma';
import { skip, type PageParams } from '../../common/utils/pagination';

export function findByIdempotencyKey(key: string) {
  return prisma.fidGeneration.findUnique({ where: { idempotencyKey: key } });
}

export function findById(id: string) {
  return prisma.fidGeneration.findUnique({ where: { id } });
}

export function markSucceeded(id: string, fileKey: string) {
  return prisma.fidGeneration.update({
    where: { id },
    data: { status: 'SUCCEEDED', fileKey, completedAt: new Date() },
  });
}

export function markFailed(id: string, failureCode: string) {
  return prisma.fidGeneration.update({
    where: { id },
    data: { status: 'FAILED', failureCode, completedAt: new Date() },
  });
}

export async function listForUser(userId: string, page: PageParams) {
  const where = { userId };
  const [items, total] = await Promise.all([
    prisma.fidGeneration.findMany({ where, orderBy: { createdAt: 'desc' }, skip: skip(page), take: page.limit }),
    prisma.fidGeneration.count({ where }),
  ]);
  return { items, total };
}
