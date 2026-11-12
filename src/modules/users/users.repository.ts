// users.repository.ts — admin user listing + status updates.
import { prisma } from '../../lib/prisma';
import { skip, type PageParams } from '../../common/utils/pagination';
import type { AccountStatus } from '../../shared/constants/account-status';
import type { Prisma } from '@prisma/client';

export interface UserFilter {
  status?: AccountStatus;
  search?: string;
}

const SAFE_SELECT = {
  id: true,
  fullName: true,
  phoneNormalized: true,
  emailNormalized: true,
  role: true,
  accountStatus: true,
  centreName: true,
  cscId: true,
  rejectedReason: true,
  approvedAt: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

export async function listUsers(filter: UserFilter, page: PageParams) {
  const where: Prisma.UserWhereInput = {
    ...(filter.status ? { accountStatus: filter.status } : {}),
    ...(filter.search
      ? {
          OR: [
            { fullName: { contains: filter.search, mode: 'insensitive' } },
            { phoneNormalized: { contains: filter.search } },
            { centreName: { contains: filter.search, mode: 'insensitive' } },
          ],
        }
      : {}),
  };
  const [items, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: SAFE_SELECT,
      orderBy: { createdAt: 'desc' },
      skip: skip(page),
      take: page.limit,
    }),
    prisma.user.count({ where }),
  ]);
  return { items, total };
}

export function findByIdSafe(id: string) {
  return prisma.user.findUnique({ where: { id }, select: SAFE_SELECT });
}

export function findRaw(id: string) {
  return prisma.user.findUnique({ where: { id } });
}

export function updateStatus(
  id: string,
  data: {
    accountStatus: AccountStatus;
    approvedById?: string | null;
    approvedAt?: Date | null;
    rejectedReason?: string | null;
  },
) {
  return prisma.user.update({ where: { id }, data, select: SAFE_SELECT });
}
