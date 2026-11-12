// announcements.service.ts — CRUD + safe YouTube embed validation + audit.
import { z } from 'zod';
import { AppError } from '../../common/errors/app-error';
import { toYouTubeEmbed } from '../../common/utils/safe-url';
import { announcementCreateSchema, announcementUpdateSchema } from '../../shared/schemas/content.schema';
import { writeAudit } from '../audit/audit.service';
import * as repo from './announcements.repository';

type CreateInput = z.infer<typeof announcementCreateSchema>;
type UpdateInput = z.infer<typeof announcementUpdateSchema>;
interface Actor { id: string; requestId?: string; ip?: string | null }

/** For a VIDEO item, require a valid YouTube URL and store only the safe embed URL. */
function resolveVideoUrl(contentType: string | undefined, videoUrl: string | undefined): string | null {
  if (contentType !== 'VIDEO') return null;
  if (!videoUrl) throw AppError.badRequest('A video URL is required for a video item', [
    { field: 'videoUrl', message: 'Required' },
  ]);
  const embed = toYouTubeEmbed(videoUrl);
  if (!embed) throw AppError.badRequest('Only valid YouTube links are allowed', [
    { field: 'videoUrl', message: 'Unsupported or unsafe video URL' },
  ]);
  return embed;
}

export const listPublic = repo.listPublic;
export const listAdmin = repo.listAdmin;

export async function createAnnouncement(input: CreateInput, actor: Actor) {
  const videoUrl = resolveVideoUrl(input.contentType, input.videoUrl);
  const created = await repo.create({
    title: input.title,
    body: input.body ?? null,
    contentType: input.contentType,
    videoUrl,
    status: input.status,
    publishAt: input.publishAt ?? null,
    expiresAt: input.expiresAt ?? null,
    sortOrder: input.sortOrder,
    createdById: actor.id,
  });
  await writeAudit({ actorUserId: actor.id, action: 'announcement.create', entityType: 'announcement', entityId: created.id, requestId: actor.requestId, ip: actor.ip });
  return created;
}

export async function updateAnnouncement(id: string, input: UpdateInput, actor: Actor) {
  const existing = await repo.findById(id);
  if (!existing) throw AppError.notFound('Announcement not found');
  const contentType = input.contentType ?? existing.contentType;
  const videoUrl =
    input.videoUrl !== undefined || input.contentType !== undefined
      ? resolveVideoUrl(contentType, input.videoUrl ?? existing.videoUrl ?? undefined)
      : existing.videoUrl;
  const updated = await repo.update(id, {
    title: input.title,
    body: input.body,
    contentType: input.contentType,
    videoUrl,
    status: input.status,
    publishAt: input.publishAt,
    expiresAt: input.expiresAt,
    sortOrder: input.sortOrder,
  });
  await writeAudit({ actorUserId: actor.id, action: 'announcement.update', entityType: 'announcement', entityId: id, requestId: actor.requestId, ip: actor.ip, after: { status: updated.status } });
  return updated;
}

export async function archiveAnnouncement(id: string, actor: Actor) {
  const existing = await repo.findById(id);
  if (!existing) throw AppError.notFound('Announcement not found');
  const updated = await repo.update(id, { status: 'ARCHIVED' });
  await writeAudit({ actorUserId: actor.id, action: 'announcement.archive', entityType: 'announcement', entityId: id, requestId: actor.requestId, ip: actor.ip });
  return updated;
}
