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
import * as storage from '../../lib/storage';
import * as users from './users.service';
import * as devices from '../devices/device-policy';
import { createAdminResetLink } from '../auth/auth.service';
import { writeAudit } from '../audit/audit.service';

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

// Admin: view the geotagged shop photo a user captured when registering.
router.get(
  '/admin/users/:id/shop-photo',
  requirePermission('users:read'),
  validate(idParam, 'params'),
  asyncHandler(async (req, res) => {
    const meta = await users.getShopPhoto(valid<{ id: string }>(req, 'params').id);
    if (!meta) throw AppError.notFound('No shop photo for this registration');
    const buffer = await storage.getPrivate(meta.key);
    res.setHeader('Content-Type', meta.mime);
    res.setHeader('Content-Disposition', 'inline');
    res.setHeader('Cache-Control', 'private, max-age=60');
    res.send(buffer);
  }),
);

// Admin: view the Aadhaar card image a user uploaded when registering.
router.get(
  '/admin/users/:id/aadhaar-doc',
  requirePermission('users:read'),
  validate(idParam, 'params'),
  asyncHandler(async (req, res) => {
    const meta = await users.getAadhaarDoc(valid<{ id: string }>(req, 'params').id);
    if (!meta) throw AppError.notFound('No Aadhaar document for this registration');
    const buffer = await storage.getPrivate(meta.key);
    res.setHeader('Content-Type', meta.mime);
    res.setHeader('Content-Disposition', 'inline');
    res.setHeader('Cache-Control', 'private, max-age=60');
    res.send(buffer);
  }),
);

// Admin: view the PAN card image a user uploaded when registering.
router.get(
  '/admin/users/:id/pan-doc',
  requirePermission('users:read'),
  validate(idParam, 'params'),
  asyncHandler(async (req, res) => {
    const meta = await users.getPanDoc(valid<{ id: string }>(req, 'params').id);
    if (!meta) throw AppError.notFound('No PAN document for this registration');
    const buffer = await storage.getPrivate(meta.key);
    res.setHeader('Content-Type', meta.mime);
    res.setHeader('Content-Disposition', 'inline');
    res.setHeader('Cache-Control', 'private, max-age=60');
    res.send(buffer);
  }),
);

// Admin: view the payment screenshot a user attached when registering.
router.get(
  '/admin/users/:id/payment-proof',
  requirePermission('users:read'),
  validate(idParam, 'params'),
  asyncHandler(async (req, res) => {
    const meta = await users.getPaymentProof(valid<{ id: string }>(req, 'params').id);
    if (!meta) throw AppError.notFound('No payment screenshot for this registration');
    const buffer = await storage.getPrivate(meta.key);
    res.setHeader('Content-Type', meta.mime);
    res.setHeader('Content-Disposition', 'inline');
    res.setHeader('Cache-Control', 'private, max-age=60');
    res.send(buffer);
  }),
);

router.post(
  '/admin/users/:id/approve',
  requirePermission('users:approve'),
  validate(idParam, 'params'),
  asyncHandler(async (req, res) => {
    const user = await users.approveUser(req.params.id!, actorOf(req));
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
    const user = await users.rejectUser(req.params.id!, actorOf(req), valid<{ reason: string }>(req).reason);
    res.json({ user });
  }),
);

router.post(
  '/admin/users/:id/suspend',
  requirePermission('users:suspend'),
  validate(idParam, 'params'),
  validate(reasonBody),
  asyncHandler(async (req, res) => {
    const user = await users.suspendUser(req.params.id!, actorOf(req), valid<{ reason: string }>(req).reason);
    res.json({ user });
  }),
);

router.post(
  '/admin/users/:id/reactivate',
  requirePermission('users:suspend'),
  validate(idParam, 'params'),
  asyncHandler(async (req, res) => {
    const user = await users.reactivateUser(req.params.id!, actorOf(req));
    res.json({ user });
  }),
);

// ── Operator devices (max 2, one signed in at a time) ──
router.get(
  '/admin/users/:id/devices',
  requirePermission('users:read'),
  validate(idParam, 'params'),
  asyncHandler(async (req, res) => {
    res.json(await devices.listDevices(req.params.id!));
  }),
);

router.delete(
  '/admin/users/:id/devices/:deviceId',
  requirePermission('users:suspend'),
  validate(z.object({ id: z.string().uuid(), deviceId: z.string().uuid() }), 'params'),
  asyncHandler(async (req, res) => {
    const { label } = await devices.removeDevice(req.params.id!, req.params.deviceId!);
    await writeAudit({
      actorUserId: req.user!.id, action: 'user.device.remove', entityType: 'user', entityId: req.params.id!,
      requestId: req.requestId, ip: req.ip, after: { device: label },
    });
    res.json({ ok: true });
  }),
);

router.post(
  '/admin/users/:id/sign-out',
  requirePermission('users:suspend'),
  validate(idParam, 'params'),
  asyncHandler(async (req, res) => {
    await devices.endActiveLogin(req.params.id!);
    await writeAudit({
      actorUserId: req.user!.id, action: 'user.session.end', entityType: 'user', entityId: req.params.id!,
      requestId: req.requestId, ip: req.ip,
    });
    res.json({ ok: true });
  }),
);

// Admin-assisted password reset (no SMS/email service): a one-time link the admin sends to the operator.
router.post(
  '/admin/users/:id/password-reset-link',
  requirePermission('users:approve'),
  validate(idParam, 'params'),
  asyncHandler(async (req, res) => {
    res.json(await createAdminResetLink(req.params.id!, { id: req.user!.id, requestId: req.requestId, ip: req.ip }));
  }),
);

export default router;
