// services.routes.ts — public active list + admin CRUD.
import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../middleware/async-handler';
import { requirePermission } from '../../middleware/require-role';
import { validate, valid } from '../../middleware/validate';
import { paginationSchema } from '../../shared/schemas/common.schema';
import { serviceCreateSchema, serviceUpdateSchema } from '../../shared/schemas/service.schema';
import { resolvePage, paginate } from '../../common/utils/pagination';
import * as services from './services.service';

const router = Router();
const actorOf = (req: import('express').Request) => ({ id: req.user!.id, requestId: req.requestId, ip: req.ip });
const idParam = z.object({ id: z.string().uuid() });

// Public: active services only.
router.get(
  '/services',
  asyncHandler(async (_req, res) => {
    res.json({ items: await services.listActive() });
  }),
);

// Admin: full catalogue (incl. inactive).
router.get(
  '/admin/services',
  requirePermission('services:manage'),
  validate(paginationSchema, 'query'),
  asyncHandler(async (req, res) => {
    const q = valid<z.infer<typeof paginationSchema>>(req, 'query');
    const page = resolvePage(q.page, q.limit);
    const { items, total } = await services.listAll(page, true);
    res.json(paginate(items, total, page));
  }),
);

router.post(
  '/admin/services',
  requirePermission('services:manage'),
  validate(serviceCreateSchema),
  asyncHandler(async (req, res) => {
    const created = await services.createService(valid(req), actorOf(req));
    res.status(201).json({ service: created });
  }),
);

router.patch(
  '/admin/services/:id',
  requirePermission('services:manage'),
  validate(idParam, 'params'),
  validate(serviceUpdateSchema),
  asyncHandler(async (req, res) => {
    const updated = await services.updateService(req.params.id, valid(req), actorOf(req));
    res.json({ service: updated });
  }),
);

router.post(
  '/admin/services/:id/deactivate',
  requirePermission('services:manage'),
  validate(idParam, 'params'),
  asyncHandler(async (req, res) => {
    const updated = await services.deactivateService(req.params.id, actorOf(req));
    res.json({ service: updated });
  }),
);

export default router;
