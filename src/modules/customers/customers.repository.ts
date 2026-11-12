// customers.repository.ts — customer data access (always ownership-scoped by the caller).
import type { Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { skip, type PageParams } from '../../common/utils/pagination';

const WITH_SERVICE = {
  service: { select: { id: true, code: true, nameKn: true, nameEn: true } },
} satisfies Prisma.CustomerInclude;

export function create(data: Prisma.CustomerCreateInput, tx?: Prisma.TransactionClient) {
  return (tx ?? prisma).customer.create({ data, include: WITH_SERVICE });
}

export function findById(id: string) {
  return prisma.customer.findFirst({ where: { id, deletedAt: null }, include: WITH_SERVICE });
}

export function buildWhere(filter: {
  ownerUserId?: string;
  status?: Prisma.CustomerWhereInput['status'];
  serviceId?: string;
  search?: string;
  from?: Date;
  to?: Date;
}): Prisma.CustomerWhereInput {
  return {
    deletedAt: null,
    ...(filter.ownerUserId ? { ownerUserId: filter.ownerUserId } : {}),
    ...(filter.status ? { status: filter.status } : {}),
    ...(filter.serviceId ? { serviceId: filter.serviceId } : {}),
    ...(filter.from || filter.to
      ? { createdAt: { ...(filter.from ? { gte: filter.from } : {}), ...(filter.to ? { lte: filter.to } : {}) } }
      : {}),
    ...(filter.search
      ? {
          OR: [
            { fullName: { contains: filter.search, mode: 'insensitive' } },
            { mobileNormalized: { contains: filter.search } },
            { referenceCode: { contains: filter.search, mode: 'insensitive' } },
          ],
        }
      : {}),
  };
}

export async function list(where: Prisma.CustomerWhereInput, page: PageParams) {
  const [items, total] = await Promise.all([
    prisma.customer.findMany({
      where,
      include: WITH_SERVICE,
      orderBy: { createdAt: 'desc' },
      skip: skip(page),
      take: page.limit,
    }),
    prisma.customer.count({ where }),
  ]);
  return { items, total };
}

/** For CSV export — stream-friendly: fetch all matching rows (capped by caller). */
export function listAll(where: Prisma.CustomerWhereInput, cap = 10000) {
  return prisma.customer.findMany({ where, include: WITH_SERVICE, orderBy: { createdAt: 'desc' }, take: cap });
}

export function countRecentDuplicates(ownerUserId: string, mobile: string, serviceId: string, since: Date) {
  return prisma.customer.count({
    where: { ownerUserId, mobileNormalized: mobile, serviceId, deletedAt: null, createdAt: { gte: since } },
  });
}

export function update(id: string, data: Prisma.CustomerUpdateInput) {
  return prisma.customer.update({ where: { id }, data, include: WITH_SERVICE });
}

export function addStatusHistory(
  client: PrismaClient | Prisma.TransactionClient,
  data: Prisma.CustomerStatusHistoryUncheckedCreateInput,
) {
  return client.customerStatusHistory.create({ data });
}

export function listStatusHistory(customerId: string) {
  return prisma.customerStatusHistory.findMany({ where: { customerId }, orderBy: { createdAt: 'asc' } });
}
