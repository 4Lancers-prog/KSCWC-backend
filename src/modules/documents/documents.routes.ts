// documents.routes.ts — public list/download (PUBLIC only) + admin upload/list/archive.
import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { asyncHandler } from '../../middleware/async-handler';
import { requirePermission } from '../../middleware/require-role';
import { validate, valid } from '../../middleware/validate';
import { documentMetaSchema, documentUpdateSchema } from '../../shared/schemas/content.schema';
import { env } from '../../config/env';
import { AppError } from '../../common/errors/app-error';
import * as svc from './documents.service';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: env.MAX_UPLOAD_SIZE_BYTES } });
const actorOf = (req: import('express').Request) => ({ id: req.user!.id, requestId: req.requestId, ip: req.ip });
const idParam = z.object({ id: z.string().uuid() });

// Visitors get public templates; logged-in users also get members-only ones. Depends on the
// session, so never cache.
router.get('/public/documents', asyncHandler(async (req, res) => {
  res.set('Cache-Control', 'private, no-store');
  res.json({ items: await svc.listPublic(!!req.user) });
}));

router.get('/public/documents/:id/download', validate(idParam, 'params'), asyncHandler(async (req, res) => {
  const { doc, buffer } = await svc.getForDownload(req.params.id!, req.user ? { id: req.user.id } : null);
  res.setHeader('Content-Type', doc.mimeType);
  const name = svc.downloadName(doc);
  // ASCII fallback + UTF-8 name (Kannada titles download with the right name)
  res.setHeader('Content-Disposition', `attachment; filename="${name.replace(/[^\x20-\x7e]/g, '_').replace(/"/g, '')}"; filename*=UTF-8''${encodeURIComponent(name)}`);
  res.setHeader('Cache-Control', 'private, no-store');
  res.send(buffer);
}));

router.get('/admin/documents', requirePermission('documents:manage'), asyncHandler(async (_req, res) => res.json({ items: await svc.listAdmin() })));

router.post(
  '/admin/documents',
  requirePermission('documents:manage'),
  upload.single('file'),
  validate(documentMetaSchema),
  asyncHandler(async (req, res) => {
    if (!req.file) throw AppError.badRequest('A file is required');
    const doc = await svc.upload(valid(req), req.file, actorOf(req));
    res.status(201).json({ document: doc });
  }),
);

// display image (cover/preview)
const imageUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024, files: 1 } });
router.get('/public/documents/:id/image', validate(idParam, 'params'), asyncHandler(async (req, res) => {
  const { buffer, mimeType } = await svc.getImage(req.params.id!, !!req.user);
  res.set({ 'Content-Type': mimeType, 'Cache-Control': 'private, max-age=3600', 'X-Content-Type-Options': 'nosniff' });
  res.send(buffer);
}));
router.post('/admin/documents/:id/image', requirePermission('documents:manage'), validate(idParam, 'params'), imageUpload.single('image'),
  asyncHandler(async (req, res) => res.json({ document: await svc.setImage(req.params.id!, req.file, actorOf(req)) })));
router.delete('/admin/documents/:id/image', requirePermission('documents:manage'), validate(idParam, 'params'),
  asyncHandler(async (req, res) => res.json({ document: await svc.removeImage(req.params.id!, actorOf(req)) })));

router.patch('/admin/documents/:id', requirePermission('documents:manage'), validate(idParam, 'params'), validate(documentUpdateSchema),
  asyncHandler(async (req, res) => res.json(await svc.updateMeta(req.params.id!, valid(req), actorOf(req)))));

router.post('/admin/documents/:id/archive', requirePermission('documents:manage'), validate(idParam, 'params'),
  asyncHandler(async (req, res) => res.json(await svc.archive(req.params.id!, actorOf(req)))));

export default router;
