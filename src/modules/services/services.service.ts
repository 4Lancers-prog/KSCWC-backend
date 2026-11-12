// services.service.ts — service catalogue business logic + audit.
import { AppError } from '../../common/errors/app-error';
import type { ServiceCreateInput, ServiceUpdateInput } from '../../shared/schemas/service.schema';
import { writeAudit } from '../audit/audit.service';
import * as repo from './services.repository';

interface Actor {
  id: string;
  requestId?: string;
  ip?: string | null;
}

export const listActive = repo.listActive;
export const listAll = repo.listAll;

export async function createService(input: ServiceCreateInput, actor: Actor) {
  const created = await repo.create({
    code: input.code,
    nameKn: input.nameKn,
    nameEn: input.nameEn ?? null,
    description: input.description ?? null,
    defaultFeePaise: input.defaultFeePaise ?? null,
    sortOrder: input.sortOrder,
    isActive: input.isActive,
  });
  await writeAudit({
    actorUserId: actor.id,
    action: 'service.create',
    entityType: 'service',
    entityId: created.id,
    requestId: actor.requestId,
    ip: actor.ip,
    after: { code: created.code },
  });
  return created;
}

export async function updateService(id: string, input: ServiceUpdateInput, actor: Actor) {
  const existing = await repo.findById(id);
  if (!existing) throw AppError.notFound('Service not found');
  const updated = await repo.update(id, {
    nameKn: input.nameKn,
    nameEn: input.nameEn,
    description: input.description,
    defaultFeePaise: input.defaultFeePaise,
    sortOrder: input.sortOrder,
    isActive: input.isActive,
  });
  await writeAudit({
    actorUserId: actor.id,
    action: 'service.update',
    entityType: 'service',
    entityId: id,
    requestId: actor.requestId,
    ip: actor.ip,
    before: { isActive: existing.isActive },
    after: { isActive: updated.isActive },
  });
  return updated;
}

export async function deactivateService(id: string, actor: Actor) {
  const existing = await repo.findById(id);
  if (!existing) throw AppError.notFound('Service not found');
  // Soft disable — never cascade-delete historic customers.
  const updated = await repo.update(id, { isActive: false });
  await writeAudit({
    actorUserId: actor.id,
    action: 'service.deactivate',
    entityType: 'service',
    entityId: id,
    requestId: actor.requestId,
    ip: actor.ip,
  });
  return updated;
}
