// documents.routes.ts — public list/download (PUBLIC only) + admin upload/list/archive.
import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { asyncHandler } from '../../middleware/async-handler';
import { requirePermission } from '../../middleware/require-role';
import { validate, valid } from '../../middleware/validate';
import { documentMetaSchema } from '../../shared/schemas/content.schema';
import { env } from '../../config/env';
import { AppError } from '../../common/errors/app-error';
import * as svc from './documents.service';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: env.MAX_UPLOAD_SIZE_BYTES } });
const actorOf = (req: import('express').Request) => ({ id: req.user!.id, requestId: req.requestId, ip: req.ip });
const idParam = z.object({ id: z.string().uuid() });

router.get('/public/documents', asyncHandler(async (_req, res) => res.json({ items: await svc.listPublic() })));

router.get('/public/documents/:id/download', validate(idParam, 'params'), asyncHandler(async (req, res) => {
  const { doc, buffer } = await svc.getForDownload(req.params.id, req.user ? { id: req.user.id } : null);
  res.setHeader('Content-Type', doc.mimeType);
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(doc.originalFilename)}"`);
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

router.post('/admin/documents/:id/archive', requirePermission('documents:manage'), validate(idParam, 'params'),
  asyncHandler(async (req, res) => res.json(await svc.archive(req.params.id, actorOf(req)))));

export default router;
