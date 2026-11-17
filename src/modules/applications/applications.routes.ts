// applications.routes.ts — public submit (insurance/membership/training/grievance) + admin list/status.
import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { AppError } from '../../common/errors/app-error';
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

// ── Public submissions (a logged-in user is linked when present) ──
// All four application forms: logged-in, ACTIVE operators only (council decision, Nov 2026).
// Every submission is linked to the operator's account so it shows under "My applications".
function requireOperator(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user) {
    return next(
      req.sessionEnded
        ? new AppError(401, 'SESSION_ENDED', 'You were signed out. Please log in again to apply.')
        : new AppError(401, 'LOGIN_REQUIRED', 'Please log in with your operator account to submit an application.'),
    );
  }
  if (req.user.accountStatus !== 'ACTIVE') return next(AppError.forbidden('Your account is not active'));
  if (req.user.role !== 'USER') {
    return next(new AppError(403, 'OPERATORS_ONLY', 'Applications are submitted from operator accounts, not staff accounts.'));
  }
  next();
}

router.post('/applications/insurance', requireOperator, publicSubmitRateLimit, validate(insuranceSubmitSchema), asyncHandler(async (req, res) =>
  res.status(201).json(await svc.submitInsurance(valid(req), actorOf(req)))));
router.post('/applications/membership', requireOperator, publicSubmitRateLimit, validate(membershipSubmitSchema), asyncHandler(async (req, res) =>
  res.status(201).json(await svc.submitMembership(valid(req), actorOf(req)))));
router.post('/applications/training', requireOperator, publicSubmitRateLimit, validate(trainingSubmitSchema), asyncHandler(async (req, res) =>
  res.status(201).json(await svc.submitTraining(valid(req), actorOf(req)))));
router.post('/applications/grievance', requireOperator, publicSubmitRateLimit, validate(grievanceSubmitSchema), asyncHandler(async (req, res) =>
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
