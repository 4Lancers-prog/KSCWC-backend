// committees.service.ts — CRUD, reorder, archive (soft delete) + audit.
import { z } from 'zod';
import { AppError } from '../../common/errors/app-error';
import { prisma } from '../../lib/prisma';
import { committeeCreateSchema, committeeUpdateSchema, committeeReorderSchema } from '../../shared/schemas/content.schema';
import { writeAudit } from '../audit/audit.service';
import * as repo from './committees.repository';

type CreateInput = z.infer<typeof committeeCreateSchema>;
type UpdateInput = z.infer<typeof committeeUpdateSchema>;
type Reorder = z.infer<typeof committeeReorderSchema>;
interface Actor { id: string; requestId?: string; ip?: string | null }

export const listPublic = repo.listPublic;
export const listAdmin = repo.listAdmin;

export async function createMember(input: CreateInput, actor: Actor) {
  const created = await repo.create({
    committeeType: input.committeeType,
    name: input.name,
    roleTitle: input.roleTitle ?? null,
    district: input.district ?? null,
    bio: input.bio ?? null,
    publicPhone: input.publicPhone ?? null,
    sortOrder: input.sortOrder,
    isActive: input.isActive,
    createdById: actor.id,
  });
  await writeAudit({ actorUserId: actor.id, action: 'committee.create', entityType: 'committee_member', entityId: created.id, requestId: actor.requestId, ip: actor.ip });
  return created;
}

export async function updateMember(id: string, input: UpdateInput, actor: Actor) {
  if (!(await repo.findById(id))) throw AppError.notFound('Member not found');
  const updated = await repo.update(id, {
    committeeType: input.committeeType,
    name: input.name,
    roleTitle: input.roleTitle,
    district: input.district,
    bio: input.bio,
    publicPhone: input.publicPhone,
    sortOrder: input.sortOrder,
    isActive: input.isActive,
  });
  await writeAudit({ actorUserId: actor.id, action: 'committee.update', entityType: 'committee_member', entityId: id, requestId: actor.requestId, ip: actor.ip });
  return updated;
}

export async function archiveMember(id: string, actor: Actor) {
  if (!(await repo.findById(id))) throw AppError.notFound('Member not found');
  const updated = await repo.update(id, { isActive: false, archivedAt: new Date() });
  await writeAudit({ actorUserId: actor.id, action: 'committee.archive', entityType: 'committee_member', entityId: id, requestId: actor.requestId, ip: actor.ip });
  return updated;
}

export async function reorder(input: Reorder, actor: Actor) {
  await prisma.$transaction(
    input.order.map((o) => prisma.committeeMember.update({ where: { id: o.id }, data: { sortOrder: o.sortOrder } })),
  );
  await writeAudit({ actorUserId: actor.id, action: 'committee.reorder', entityType: 'committee_member', requestId: actor.requestId, ip: actor.ip });
  return { ok: true };
}
