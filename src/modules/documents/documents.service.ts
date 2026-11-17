// documents.service.ts — upload (content-validated), list, download, archive.
import { nanoid } from 'nanoid';
import { DocumentModel } from '../../db/models';
import { connectDb, toPlain } from '../../lib/db';
import { AppError } from '../../common/errors/app-error';
import { env } from '../../config/env';
import { assertInScope, scopeForKind } from '../categories/categories.service';
import * as storage from '../../lib/storage';
import { writeAudit } from '../audit/audit.service';

interface Actor { id: string; requestId?: string; ip?: string | null }

// What can be uploaded as a template. The file's real content is checked ("sniffed"), so a renamed
// file can't pretend to be a PDF/Word file.
const isZip = (b: Buffer) => b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04;
const isOle = (b: Buffer) => b.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]));
const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const ALLOWED: Record<string, { ext: string; label: string; sniff: (b: Buffer) => boolean }> = {
  'application/pdf': { ext: 'pdf', label: 'PDF', sniff: (b) => b.subarray(0, 5).toString() === '%PDF-' },
  [DOCX]: { ext: 'docx', label: 'Word', sniff: isZip },
  'application/msword': { ext: 'doc', label: 'Word', sniff: isOle },
  'image/png': { ext: 'png', label: 'Image', sniff: (b) => b[0] === 0x89 && b[1] === 0x50 },
  'image/jpeg': { ext: 'jpg', label: 'Image', sniff: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
};
// Some browsers/PCs send Word files as application/octet-stream or similar — decide by extension,
// then still verify the content.
const BY_EXT: Record<string, string> = { pdf: 'application/pdf', docx: DOCX, doc: 'application/msword', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg' };
function resolveType(file: { originalname: string; mimetype: string }): string | null {
  if (ALLOWED[file.mimetype]) return file.mimetype;
  const ext = (file.originalname.split('.').pop() ?? '').toLowerCase();
  return BY_EXT[ext] ?? null;
}
const extOf = (mime: string) => ALLOWED[mime]?.ext ?? 'bin';

/** Visitors: PUBLIC templates. Logged-in users: also the members-only (PRIVATE) ones. */
export async function listPublic(loggedIn = false) {
  await connectDb();
  const rows = await DocumentModel.find({
    isActive: true, archivedAt: null, ...(loggedIn ? {} : { visibility: 'PUBLIC' }),
  })
    .sort({ createdAt: -1 })
    .select('title description kind categoryId mimeType sizeBytes visibility imageKey createdAt updatedAt')
    .lean();
  return toPlain<Record<string, unknown>[]>(rows).map(publicShape);
}

export async function listAdmin() {
  await connectDb();
  const rows = await DocumentModel.find({ archivedAt: null }).sort({ createdAt: -1 }).select('-fileKey').lean();
  return toPlain<Record<string, unknown>[]>(rows).map(publicShape);
}

export async function upload(
  meta: { title: string; description?: string; kind: 'APPLICATION' | 'DRAFT'; categoryId?: string; visibility: 'PUBLIC' | 'PRIVATE' },
  file: { buffer: Buffer; originalname: string; mimetype: string; size: number },
  actor: Actor,
) {
  const mime = resolveType(file);
  const rule = mime ? ALLOWED[mime] : undefined;
  if (!mime || !rule) throw AppError.badRequest('Unsupported file type. Upload a PDF or Word file (.pdf, .doc, .docx), or a JPG/PNG image.');
  if (file.size > env.MAX_UPLOAD_SIZE_BYTES) {
    throw AppError.badRequest(`The file is too large (max ${Math.round(env.MAX_UPLOAD_SIZE_BYTES / 1024 / 1024)} MB).`);
  }
  if (!rule.sniff(file.buffer)) throw AppError.badRequest(`This file is not a real ${rule.label} file (its content does not match .${rule.ext}).`);
  await assertInScope(meta.categoryId, scopeForKind(meta.kind));

  const key = `documents/${nanoid(20)}.${rule.ext}`; // randomised object key
  await storage.putPrivate(key, file.buffer, mime);
  await connectDb();
  const doc = toPlain<{ id: string }>((await DocumentModel.create({
    title: meta.title,
    description: meta.description || null,
    kind: meta.kind,
    categoryId: meta.categoryId ?? null,
    fileKey: key,
    originalFilename: file.originalname.slice(0, 255),
    mimeType: mime,
    sizeBytes: file.size,
    visibility: meta.visibility,
    uploadedById: actor.id,
  })).toObject());
  await writeAudit({ actorUserId: actor.id, action: 'document.upload', entityType: 'document', entityId: doc.id, requestId: actor.requestId, ip: actor.ip, after: { visibility: meta.visibility, kind: meta.kind } });
  return publicShape(doc as Record<string, unknown>);
}

export async function getForDownload(id: string, requester: { id?: string } | null) {
  await connectDb();
  const found = await DocumentModel.findOne({ _id: id, isActive: true, archivedAt: null }).lean();
  const doc = found ? toPlain<{ id: string; visibility: string; fileKey: string; mimeType: string; originalFilename: string; title: string }>(found) : null;
  if (!doc) throw AppError.notFound('Document not found');
  if (doc.visibility === 'PRIVATE' && !requester?.id) throw AppError.notFound('Document not found');
  const buffer = await storage.getPrivate(doc.fileKey);
  return { doc, buffer };
}

export async function archive(id: string, actor: Actor) {
  await connectDb();
  const res = await DocumentModel.updateOne({ _id: id }, { $set: { isActive: false, archivedAt: new Date() } });
  if (res.matchedCount === 0) throw AppError.notFound('Document not found');
  await writeAudit({ actorUserId: actor.id, action: 'document.archive', entityType: 'document', entityId: id, requestId: actor.requestId, ip: actor.ip });
  return { ok: true };
}

export async function updateMeta(
  id: string,
  input: { title?: string; description?: string | null; kind?: 'APPLICATION' | 'DRAFT'; categoryId?: string | null; visibility?: 'PUBLIC' | 'PRIVATE' },
  actor: Actor,
) {
  await connectDb();
  const cur = await DocumentModel.findOne({ _id: id, archivedAt: null }).select('kind categoryId').lean();
  if (!cur) throw AppError.notFound('Document not found');
  const kind = input.kind ?? (cur.kind as 'APPLICATION' | 'DRAFT' | undefined);
  // moving between "application forms" and "drafts": the category must belong to the new section
  if (input.kind && input.kind !== cur.kind && input.categoryId === undefined) input.categoryId = null;
  await assertInScope(input.categoryId, scopeForKind(kind));
  const set = Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined));
  const res = await DocumentModel.updateOne({ _id: id, archivedAt: null }, { $set: set });
  if (res.matchedCount === 0) throw AppError.notFound('Document not found');
  await writeAudit({ actorUserId: actor.id, action: 'document.update', entityType: 'document', entityId: id, requestId: actor.requestId, ip: actor.ip, after: set });
  return { ok: true };
}

/** Download name: the template title + its real extension (so Windows/phones know how to open it). */
export function downloadName(doc: { title: string; mimeType: string }) {
  const safe = doc.title.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120) || 'template';
  return `${safe}.${extOf(doc.mimeType)}`;
}

// ── Display image (cover / preview shown next to the document) ──
const IMG_MAX = 2 * 1024 * 1024;
const IMG_RULES: Record<string, (b: Buffer) => boolean> = {
  'image/png': (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  'image/jpeg': (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  'image/webp': (b) => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP',
};

/** API shape: never expose storage keys; add file extension + a versioned image address. */
function publicShape(d: Record<string, unknown>) {
  const { imageKey, imageMime: _m, fileKey: _f, ...rest } = d as Record<string, unknown> & { imageKey?: string | null };
  const v = new Date((d.updatedAt as Date | string | undefined) ?? (d.createdAt as Date | string | undefined) ?? Date.now()).getTime();
  return {
    ...rest,
    kind: (d.kind as string | undefined) ?? 'APPLICATION',
    fileExt: extOf(String(d.mimeType)),
    imageUrl: imageKey ? `/api/v1/public/documents/${String(d.id)}/image?v=${v}` : null,
  };
}

export async function setImage(id: string, file: { buffer: Buffer; mimetype: string; size: number } | undefined, actor: Actor) {
  if (!file) throw AppError.badRequest('Choose an image file');
  const sniff = IMG_RULES[file.mimetype];
  if (!sniff) throw AppError.badRequest('Only PNG, JPG or WebP images are allowed');
  if (file.size > IMG_MAX) throw AppError.badRequest('Image must be 2 MB or smaller');
  if (!sniff(file.buffer)) throw AppError.badRequest('Image content does not match its type');
  await connectDb();
  if (!(await DocumentModel.exists({ _id: id, archivedAt: null }))) throw AppError.notFound('Document not found');
  const key = `doc-images/${id}-${Date.now()}.${file.mimetype.split('/')[1]}`;
  await storage.putPrivate(key, file.buffer, file.mimetype);
  await DocumentModel.updateOne({ _id: id }, { $set: { imageKey: key, imageMime: file.mimetype } });
  await writeAudit({ actorUserId: actor.id, action: 'document.image.set', entityType: 'document', entityId: id, requestId: actor.requestId, ip: actor.ip });
  return publicShape(toPlain((await DocumentModel.findById(id).select('-fileKey').lean())!));
}

export async function removeImage(id: string, actor: Actor) {
  await connectDb();
  const res = await DocumentModel.updateOne({ _id: id, archivedAt: null }, { $set: { imageKey: null, imageMime: null } });
  if (res.matchedCount === 0) throw AppError.notFound('Document not found');
  await writeAudit({ actorUserId: actor.id, action: 'document.image.remove', entityType: 'document', entityId: id, requestId: actor.requestId, ip: actor.ip });
  return publicShape(toPlain((await DocumentModel.findById(id).select('-fileKey').lean())!));
}

/** Same visibility rule as the document itself: members-only documents need a login. */
export async function getImage(id: string, loggedIn: boolean) {
  await connectDb();
  const d = await DocumentModel.findOne({ _id: id, isActive: true, archivedAt: null }).select('imageKey imageMime visibility').lean();
  if (!d?.imageKey || (d.visibility === 'PRIVATE' && !loggedIn)) throw AppError.notFound('No image');
  return { buffer: await storage.getPrivate(d.imageKey), mimeType: d.imageMime ?? 'image/png' };
}
