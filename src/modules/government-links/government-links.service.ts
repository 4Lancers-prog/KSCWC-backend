// government-links.service.ts — CRUD with https-only validation + audit.
import { z } from 'zod';
import { AppError } from '../../common/errors/app-error';
import { isSafeHttpsUrl } from '../../common/utils/safe-url';
import { govLinkCreateSchema, govLinkUpdateSchema } from '../../shared/schemas/content.schema';
import { writeAudit } from '../audit/audit.service';
import * as repo from './government-links.repository';

type CreateInput = z.infer<typeof govLinkCreateSchema>;
type UpdateInput = z.infer<typeof govLinkUpdateSchema>;
interface Actor { id: string; requestId?: string; ip?: string | null }

function assertSafe(url: string | undefined) {
  if (url !== undefined && !isSafeHttpsUrl(url)) {
    throw AppError.badRequest('Links must be valid https URLs', [{ field: 'url', message: 'Use a secure https link' }]);
  }
}

export const listPublic = repo.listPublic;
export const listAdmin = repo.listAdmin;

export async function createLink(input: CreateInput, actor: Actor) {
  assertSafe(input.url);
  const created = await repo.create({
    title: input.title, url: input.url, description: input.description ?? null,
    sortOrder: input.sortOrder, isActive: input.isActive, createdById: actor.id,
  });
  await writeAudit({ actorUserId: actor.id, action: 'govlink.create', entityType: 'government_link', entityId: created.id, requestId: actor.requestId, ip: actor.ip });
  return created;
}

export async function updateLink(id: string, input: UpdateInput, actor: Actor) {
  if (!(await repo.findById(id))) throw AppError.notFound('Link not found');
  assertSafe(input.url);
  const updated = await repo.update(id, input);
  await writeAudit({ actorUserId: actor.id, action: 'govlink.update', entityType: 'government_link', entityId: id, requestId: actor.requestId, ip: actor.ip });
  return updated;
}

export async function deactivateLink(id: string, actor: Actor) {
  if (!(await repo.findById(id))) throw AppError.notFound('Link not found');
  const updated = await repo.update(id, { isActive: false });
  await writeAudit({ actorUserId: actor.id, action: 'govlink.deactivate', entityType: 'government_link', entityId: id, requestId: actor.requestId, ip: actor.ip });
  return updated;
}
