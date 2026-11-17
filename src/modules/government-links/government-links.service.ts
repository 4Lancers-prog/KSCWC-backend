// government-links.service.ts — CRUD with https-only validation + audit.
import { z } from 'zod';
import { AppError } from '../../common/errors/app-error';
import { isSafeHttpsUrl } from '../../common/utils/safe-url';
import { govLinkCreateSchema, govLinkUpdateSchema } from '../../shared/schemas/content.schema';
import { writeAudit } from '../audit/audit.service';
import * as repo from './government-links.repository';
import * as storage from '../../lib/storage';
import { assertInScope } from '../categories/categories.service';
import { GovernmentLink } from '../../db/models';
import { connectDb } from '../../lib/db';

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
  await assertInScope(input.categoryId, 'LINKS');
  assertSafe(input.url);
  const created = await repo.create({
    title: input.title, url: input.url, description: input.description ?? null,
    categoryId: input.categoryId ?? null, category: input.category ?? 'OTHER', featured: input.featured,
    sortOrder: input.sortOrder, isActive: input.isActive, createdById: actor.id,
  });
  await writeAudit({ actorUserId: actor.id, action: 'govlink.create', entityType: 'government_link', entityId: created.id, requestId: actor.requestId, ip: actor.ip });
  return created;
}

export async function updateLink(id: string, input: UpdateInput, actor: Actor) {
  await assertInScope(input.categoryId, 'LINKS');
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

// ── Portal logo / photo ──
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const IMAGE_RULES: Record<string, { ext: string; sniff: (b: Buffer) => boolean }> = {
  'image/png': { ext: 'png', sniff: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  'image/jpeg': { ext: 'jpg', sniff: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  'image/webp': { ext: 'webp', sniff: (b) => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP' },
};
type UploadFile = { buffer: Buffer; mimetype: string; size: number };

/** Public shape: never expose storage keys; give a versioned image address instead. */
export function toPublicShape<T extends Record<string, unknown>>(l: T) {
  const { imageKey, imageMime: _m, ...rest } = l as T & { imageKey?: string | null; imageMime?: string | null };
  const v = new Date((l.updatedAt as Date | string | undefined) ?? Date.now()).getTime();
  return { ...rest, imageUrl: imageKey ? `/api/v1/public/government-links/${String(l.id)}/image?v=${v}` : null };
}

export async function setLinkImage(id: string, file: UploadFile | undefined, actor: Actor) {
  if (!file) throw AppError.badRequest('Choose an image file');
  const rule = IMAGE_RULES[file.mimetype];
  if (!rule) throw AppError.badRequest('Only PNG, JPG or WebP images are allowed');
  if (file.size > MAX_IMAGE_BYTES) throw AppError.badRequest('Image must be 2 MB or smaller');
  if (!rule.sniff(file.buffer)) throw AppError.badRequest('Image content does not match its type');
  await connectDb();
  if (!(await GovernmentLink.exists({ _id: id }))) throw AppError.notFound('Link not found');
  const key = `govlinks/${id}-${Date.now()}.${rule.ext}`;
  await storage.putPrivate(key, file.buffer, file.mimetype);
  await GovernmentLink.updateOne({ _id: id }, { $set: { imageKey: key, imageMime: file.mimetype } });
  await writeAudit({ actorUserId: actor.id, action: 'govlink.image.set', entityType: 'government_link', entityId: id, requestId: actor.requestId, ip: actor.ip });
  return toPublicShape((await repo.findById(id))!);
}

export async function removeLinkImage(id: string, actor: Actor) {
  await connectDb();
  const res = await GovernmentLink.updateOne({ _id: id }, { $set: { imageKey: null, imageMime: null } });
  if (res.matchedCount === 0) throw AppError.notFound('Link not found');
  await writeAudit({ actorUserId: actor.id, action: 'govlink.image.remove', entityType: 'government_link', entityId: id, requestId: actor.requestId, ip: actor.ip });
  return toPublicShape((await repo.findById(id))!);
}

/** The image of an ACTIVE link (logos are public; addresses are not). */
export async function getLinkImage(id: string) {
  await connectDb();
  const l = await GovernmentLink.findOne({ _id: id, isActive: true }).select('imageKey imageMime').lean();
  if (!l?.imageKey) throw AppError.notFound('No image');
  return { buffer: await storage.getPrivate(l.imageKey), mimeType: l.imageMime ?? 'image/png' };
}
