// government-links.repository.ts — government link data access.
import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';

export const listPublic = () =>
  prisma.governmentLink.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }] });
export const listAdmin = () => prisma.governmentLink.findMany({ orderBy: { sortOrder: 'asc' } });
export const findById = (id: string) => prisma.governmentLink.findUnique({ where: { id } });
export const create = (data: Prisma.GovernmentLinkCreateInput) => prisma.governmentLink.create({ data });
export const update = (id: string, data: Prisma.GovernmentLinkUpdateInput) => prisma.governmentLink.update({ where: { id }, data });
