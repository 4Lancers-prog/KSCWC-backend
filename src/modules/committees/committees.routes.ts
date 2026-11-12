// committees.routes.ts — public (grouped, district filter) + admin CRUD/reorder/archive.
import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../middleware/async-handler';
import { requirePermission } from '../../middleware/require-role';
import { validate, valid } from '../../middleware/validate';
import { COMMITTEE_TYPES } from '../../shared/constants/committee';
import { committeeCreateSchema, committeeUpdateSchema, committeeReorderSchema } from '../../shared/schemas/content.schema';
import * as svc from './committees.service';

const router = Router();
const actorOf = (req: import('express').Request) => ({ id: req.user!.id, requestId: req.requestId, ip: req.ip });
const idParam = z.object({ id: z.string().uuid() });
const publicQuery = z.object({ committeeType: z.enum(COMMITTEE_TYPES).optional(), district: z.string().trim().max(120).optional() });

router.get('/public/committees', validate(publicQuery, 'query'), asyncHandler(async (req, res) => {
  const q = valid<z.infer<typeof publicQuery>>(req, 'query');
  res.json({ items: await svc.listPublic({ committeeType: q.committeeType, district: q.district }) });
}));

router.get('/admin/committees', requirePermission('committees:manage'), asyncHandler(async (_req, res) => {
  res.json({ items: await svc.listAdmin() });
}));

router.post('/admin/committees', requirePermission('committees:manage'), validate(committeeCreateSchema),
  asyncHandler(async (req, res) => res.status(201).json({ member: await svc.createMember(valid(req), actorOf(req)) })));

router.post('/admin/committees/reorder', requirePermission('committees:manage'), validate(committeeReorderSchema),
  asyncHandler(async (req, res) => res.json(await svc.reorder(valid(req), actorOf(req)))));

router.patch('/admin/committees/:id', requirePermission('committees:manage'), validate(idParam, 'params'), validate(committeeUpdateSchema),
  asyncHandler(async (req, res) => res.json({ member: await svc.updateMember(req.params.id, valid(req), actorOf(req)) })));

router.post('/admin/committees/:id/archive', requirePermission('committees:manage'), validate(idParam, 'params'),
  asyncHandler(async (req, res) => res.json({ member: await svc.archiveMember(req.params.id, actorOf(req)) })));

export default router;
