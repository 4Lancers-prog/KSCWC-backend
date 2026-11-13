// applications.routes.ts — public submit (insurance/membership/training/grievance) + admin list/status.
import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../middleware/async-handler';
import { requirePermission } from '../../middleware/require-role';
import { validate, valid } from '../../middleware/validate';
import { publicSubmitRateLimit } from '../../middleware/rate-limit';
import { paginationSchema } from '../../shared/schemas/common.schema';
import {
  insuranceSubmitSchema, membershipSubmitSchema, trainingSubmitSchema, grievanceSubmitSchema,
  insuranceStatusSchema, membershipStatusSchema, trainingStatusSchema, grievanceStatusSchema,
} from '../../shared/schemas/application.schema';
import { resolvePage } from '../../common/utils/pagination';
import * as svc from './applications.service';

const router = Router();
const actorOf = (req: import('express').Request) => ({ id: req.user?.id, requestId: req.requestId, ip: req.ip });
const idParam = z.object({ id: z.string().uuid() });

// ── Public submissions (a logged-in user is linked when present) ──
router.post('/applications/insurance', publicSubmitRateLimit, validate(insuranceSubmitSchema), asyncHandler(async (req, res) =>
  res.status(201).json(await svc.submitInsurance(valid(req), actorOf(req)))));
router.post('/applications/membership', publicSubmitRateLimit, validate(membershipSubmitSchema), asyncHandler(async (req, res) =>
  res.status(201).json(await svc.submitMembership(valid(req), actorOf(req)))));
router.post('/applications/training', publicSubmitRateLimit, validate(trainingSubmitSchema), asyncHandler(async (req, res) =>
  res.status(201).json(await svc.submitTraining(valid(req), actorOf(req)))));
router.post('/applications/grievance', publicSubmitRateLimit, validate(grievanceSubmitSchema), asyncHandler(async (req, res) =>
  res.status(201).json(await svc.submitGrievance(valid(req), actorOf(req)))));

// ── Admin list + status ──
const KINDS = ['insurance', 'membership', 'training', 'grievances'] as const;
const kindParam = z.object({ kind: z.enum(KINDS) });
const listQuery = paginationSchema.extend({ status: z.string().max(40).optional() });

router.get('/admin/applications/:kind', requirePermission('applications:manage'),
  validate(kindParam, 'params'), validate(listQuery, 'query'),
  asyncHandler(async (req, res) => {
    const q = valid<z.infer<typeof listQuery>>(req, 'query');
    const page = resolvePage(q.page, q.limit);
    res.json(await svc.adminList(req.params.kind as (typeof KINDS)[number], page, q.status));
  }));

const statusSchemas = {
  insurance: insuranceStatusSchema, membership: membershipStatusSchema,
  training: trainingStatusSchema, grievances: grievanceStatusSchema,
} as const;

router.post('/admin/applications/:kind/:id/status', requirePermission('applications:manage'),
  validate(z.object({ kind: z.enum(KINDS), id: z.string().uuid() }), 'params'),
  asyncHandler(async (req, res) => {
    const kind = req.params.kind as (typeof KINDS)[number];
    const parsed = statusSchemas[kind].safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ code: 'BAD_REQUEST', message: 'Invalid status', requestId: req.requestId });
    const note = kind === 'grievances' ? (parsed.data as { resolutionNote?: string }).resolutionNote : undefined;
    const row = await svc.adminSetStatus(kind, req.params.id!, parsed.data.status, actorOf(req), { resolutionNote: note });
    return res.json({ application: row });
  }));

export default router;
