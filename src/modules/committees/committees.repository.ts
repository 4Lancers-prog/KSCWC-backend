// committees.repository.ts — committee member data access.
import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';

export function listPublic(filter: { committeeType?: Prisma.CommitteeMemberWhereInput['committeeType']; district?: string }) {
  return prisma.committeeMember.findMany({
    where: {
      isActive: true,
      archivedAt: null,
      ...(filter.committeeType ? { committeeType: filter.committeeType } : {}),
      ...(filter.district ? { district: filter.district } : {}),
    },
    orderBy: [{ committeeType: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
  });
}

export function listAdmin() {
  return prisma.committeeMember.findMany({ orderBy: [{ committeeType: 'asc' }, { sortOrder: 'asc' }] });
}

export const findById = (id: string) => prisma.committeeMember.findUnique({ where: { id } });
export const create = (data: Prisma.CommitteeMemberCreateInput) => prisma.committeeMember.create({ data });
export const update = (id: string, data: Prisma.CommitteeMemberUpdateInput) => prisma.committeeMember.update({ where: { id }, data });
