// documents.service.ts — upload (content-validated), list, download, archive.
import { nanoid } from 'nanoid';
import { DocumentModel } from '../../db/models';
import { connectDb, toPlain } from '../../lib/db';
import { AppError } from '../../common/errors/app-error';
import { env } from '../../config/env';
import * as storage from '../../lib/storage';
import { writeAudit } from '../audit/audit.service';

interface Actor { id: string; requestId?: string; ip?: string | null }

const ALLOWED: Record<string, { ext: string; sniff: (b: Buffer) => boolean }> = {
  'application/pdf': { ext: 'pdf', sniff: (b) => b.subarray(0, 5).toString() === '%PDF-' },
  'image/png': { ext: 'png', sniff: (b) => b[0] === 0x89 && b[1] === 0x50 },
  'image/jpeg': { ext: 'jpg', sniff: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': {
    ext: 'docx',
    sniff: (b) => b[0] === 0x50 && b[1] === 0x4b, // PK zip header
  },
};

export async function listPublic() {
  await connectDb();
  return toPlain<Record<string, unknown>[]>(
    await DocumentModel.find({ visibility: 'PUBLIC', isActive: true, archivedAt: null })
      .sort({ createdAt: -1 })
      .select('title category mimeType sizeBytes createdAt')
      .lean(),
  );
}

export async function listAdmin() {
  await connectDb();
  return toPlain<Record<string, unknown>[]>(await DocumentModel.find({ archivedAt: null }).sort({ createdAt: -1 }).lean());
}

export async function upload(
  meta: { title: string; category?: string; visibility: 'PUBLIC' | 'PRIVATE' },
  file: { buffer: Buffer; originalname: string; mimetype: string; size: number },
  actor: Actor,
) {
  const rule = ALLOWED[file.mimetype];
  if (!rule) throw AppError.badRequest('Unsupported file type (PDF, DOCX, JPG, PNG only)');
  if (file.size > env.MAX_UPLOAD_SIZE_BYTES) throw AppError.badRequest('File is too large');
  if (!rule.sniff(file.buffer)) throw AppError.badRequest('File content does not match its type');

  const key = `documents/${nanoid(20)}.${rule.ext}`; // randomised object key
  await storage.putPrivate(key, file.buffer, file.mimetype);
  await connectDb();
  const doc = toPlain<{ id: string }>((await DocumentModel.create({
    title: meta.title,
    category: meta.category ?? null,
    fileKey: key,
    originalFilename: file.originalname.slice(0, 255),
    mimeType: file.mimetype,
    sizeBytes: file.size,
    visibility: meta.visibility,
    uploadedById: actor.id,
  })).toObject());
  await writeAudit({ actorUserId: actor.id, action: 'document.upload', entityType: 'document', entityId: doc.id, requestId: actor.requestId, ip: actor.ip, after: { visibility: meta.visibility } });
  return doc;
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
