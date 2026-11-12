// users.routes.ts — /api/v1/admin/users/* (permission-gated admin approvals).
import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../middleware/async-handler';
import { requirePermission } from '../../middleware/require-role';
import { validate, valid } from '../../middleware/validate';
import { paginationSchema } from '../../shared/schemas/common.schema';
import { ACCOUNT_STATUSES } from '../../shared/constants/account-status';
import { resolvePage, paginate } from '../../common/utils/pagination';
import { AppError } from '../../common/errors/app-error';
import * as users from './users.service';

const router = Router();
const actorOf = (req: import('express').Request) => ({
  id: req.user!.id,
  requestId: req.requestId,
  ip: req.ip,
});

const listQuery = paginationSchema.extend({
  status: z.enum(ACCOUNT_STATUSES).optional(),
  search: z.string().trim().max(120).optional(),
});

router.get(
  '/admin/users',
  requirePermission('users:read'),
  validate(listQuery, 'query'),
  asyncHandler(async (req, res) => {
    const q = valid<z.infer<typeof listQuery>>(req, 'query');
    const page = resolvePage(q.page, q.limit);
    const { items, total } = await users.listUsers({ status: q.status, search: q.search }, page);
    res.json(paginate(items, total, page));
  }),
);

const idParam = z.object({ id: z.string().uuid() });

router.get(
  '/admin/users/:id',
  requirePermission('users:read'),
  validate(idParam, 'params'),
  asyncHandler(async (req, res) => {
    const user = await users.getUser(valid<{ id: string }>(req, 'params').id);
    if (!user) throw AppError.notFound('User not found');
    res.json({ user });
  }),
);

router.post(
  '/admin/users/:id/approve',
  requirePermission('users:approve'),
  validate(idParam, 'params'),
  asyncHandler(async (req, res) => {
    const user = await users.approveUser(req.params.id, actorOf(req));
    res.json({ user });
  }),
);

const reasonBody = z.object({ reason: z.string().trim().min(3).max(500) });

router.post(
  '/admin/users/:id/reject',
  requirePermission('users:approve'),
  validate(idParam, 'params'),
  validate(reasonBody),
  asyncHandler(async (req, res) => {
    const user = await users.rejectUser(req.params.id, actorOf(req), valid<{ reason: string }>(req).reason);
    res.json({ user });
  }),
);

router.post(
  '/admin/users/:id/suspend',
  requirePermission('users:suspend'),
  validate(idParam, 'params'),
  validate(reasonBody),
  asyncHandler(async (req, res) => {
    const user = await users.suspendUser(req.params.id, actorOf(req), valid<{ reason: string }>(req).reason);
    res.json({ user });
  }),
);

router.post(
  '/admin/users/:id/reactivate',
  requirePermission('users:suspend'),
  validate(idParam, 'params'),
  asyncHandler(async (req, res) => {
    const user = await users.reactivateUser(req.params.id, actorOf(req));
    res.json({ user });
  }),
);

export default router;
