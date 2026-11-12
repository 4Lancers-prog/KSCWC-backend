// services.repository.ts — service catalogue data access.
import { prisma } from '../../lib/prisma';
import { skip, type PageParams } from '../../common/utils/pagination';
import type { Prisma } from '@prisma/client';

export function listActive() {
  return prisma.service.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: 'asc' }, { nameEn: 'asc' }],
  });
}

export async function listAll(page: PageParams, includeInactive = true) {
  const where: Prisma.ServiceWhereInput = includeInactive ? {} : { isActive: true };
  const [items, total] = await Promise.all([
    prisma.service.findMany({ where, orderBy: { sortOrder: 'asc' }, skip: skip(page), take: page.limit }),
    prisma.service.count({ where }),
  ]);
  return { items, total };
}

export function findById(id: string) {
  return prisma.service.findUnique({ where: { id } });
}

export function create(data: Prisma.ServiceCreateInput) {
  return prisma.service.create({ data });
}

export function update(id: string, data: Prisma.ServiceUpdateInput) {
  return prisma.service.update({ where: { id }, data });
}
