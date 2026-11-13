// fid.routes.ts — generate, list, detail, authenticated PDF download.
import { Router } from 'express';
import { z } from 'zod';
import { nanoid } from 'nanoid';
import { asyncHandler } from '../../middleware/async-handler';
import { requireAuth } from '../../middleware/require-auth';
import { requirePermission } from '../../middleware/require-role';
import { validate, valid } from '../../middleware/validate';
import { paginationSchema } from '../../shared/schemas/common.schema';
import { fidGenerateSchema, type FidGenerateInput } from '../../shared/schemas/fid.schema';
import * as fid from './fid.service';

const router = Router();

// Official Karnataka FID portal link — operators read it; admins (settings:manage) edit it.
const portalLinkSchema = z.object({
  url: z
    .string()
    .trim()
    .url('Enter a valid URL')
    .max(500)
    .refine((u) => /^https?:\/\//i.test(u), 'URL must start with http:// or https://'),
});

router.get('/fid/portal-link', requireAuth, asyncHandler(async (_req, res) => res.json(await fid.getFidPortalUrl())));

router.put(
  '/admin/fid/portal-link',
  requirePermission('settings:manage'),
  validate(portalLinkSchema),
  asyncHandler(async (req, res) => {
    res.json(await fid.setFidPortalUrl(valid<{ url: string }>(req).url, {
      id: req.user!.id,
      requestId: req.requestId,
      ip: req.ip,
    }));
  }),
);
const actorOf = (req: import('express').Request): fid.Actor => ({
  id: req.user!.id,
  requestId: req.requestId,
  ip: req.ip,
});

router.post(
  '/fid-generations',
  requireAuth,
  validate(fidGenerateSchema),
  asyncHandler(async (req, res) => {
    // Idempotency-Key header dedupes retries; generate one if the client didn't send it.
    const key = (req.header('idempotency-key') || `fidgen_${nanoid(20)}`).slice(0, 160);
    const result = await fid.generateFid(actorOf(req), valid<FidGenerateInput>(req), key);
    res.status(201).json(result);
  }),
);

router.get(
  '/fid-generations',
  requireAuth,
  validate(paginationSchema, 'query'),
  asyncHandler(async (req, res) => {
    res.json(await fid.listGenerations(req.user!.id, valid<z.infer<typeof paginationSchema>>(req, 'query')));
  }),
);

const idParam = z.object({ id: z.string().uuid() });

router.get(
  '/fid-generations/:id',
  requireAuth,
  validate(idParam, 'params'),
  asyncHandler(async (req, res) => {
    res.json(await fid.getGeneration(req.params.id!, req.user!.id));
  }),
);

router.get(
  '/fid-generations/:id/download',
  requireAuth,
  validate(idParam, 'params'),
  asyncHandler(async (req, res) => {
    const pdf = await fid.getDownload(req.params.id!, req.user!.id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="fid-card-${req.params.id}.pdf"`);
    res.send(pdf);
  }),
);

export default router;
