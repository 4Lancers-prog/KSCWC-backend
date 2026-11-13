// manual-topup.routes.ts — UPI/QR top-up: user submit + history, admin QR config + review.
import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { asyncHandler } from '../../middleware/async-handler';
import { requireAuth } from '../../middleware/require-auth';
import { requirePermission } from '../../middleware/require-role';
import { validate, valid } from '../../middleware/validate';
import { env } from '../../config/env';
import { AppError } from '../../common/errors/app-error';
import {
  manualTopupCreateSchema,
  manualTopupListSchema,
  manualTopupApproveSchema,
  manualTopupRejectSchema,
  paymentQrConfigSchema,
  type ManualTopupCreateInput,
  type ManualTopupApproveInput,
  type ManualTopupRejectInput,
  type PaymentQrConfigInput,
} from '../../shared/schemas/manual-topup.schema';
import * as svc from './manual-topup.service';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: env.MAX_UPLOAD_SIZE_BYTES } });
const actorOf = (req: import('express').Request) => ({ id: req.user!.id, requestId: req.requestId, ip: req.ip });
const idParam = z.object({ id: z.string().uuid() });
type ListQuery = z.infer<typeof manualTopupListSchema>;

// ── User: see the QR to pay ──
router.get('/payment-qr', requireAuth, asyncHandler(async (_req, res) => res.json(await svc.getPaymentQrPublic())));

router.get(
  '/payment-qr/image',
  requireAuth,
  asyncHandler(async (_req, res) => {
    const { buffer, mimeType } = await svc.getPaymentQrImage();
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Cache-Control', 'private, max-age=60');
    res.send(buffer);
  }),
);

// ── User: submit a manual top-up (optional payment screenshot) ──
router.post(
  '/wallet/manual-topups',
  requireAuth,
  upload.single('screenshot'),
  validate(manualTopupCreateSchema),
  asyncHandler(async (req, res) => {
    const result = await svc.submitManualTopup(req.user!.id, valid<ManualTopupCreateInput>(req), req.file, actorOf(req));
    res.status(201).json(result);
  }),
);

router.get(
  '/wallet/manual-topups',
  requireAuth,
  validate(manualTopupListSchema, 'query'),
  asyncHandler(async (req, res) => {
    res.json(await svc.listMyTopups(req.user!.id, valid<ListQuery>(req, 'query')));
  }),
);

// ── Admin: QR configuration (settings:manage) ──
router.put(
  '/admin/payment-qr',
  requirePermission('settings:manage'),
  upload.single('image'),
  validate(paymentQrConfigSchema),
  asyncHandler(async (req, res) => {
    res.json(await svc.setPaymentQr(valid<PaymentQrConfigInput>(req), req.file, actorOf(req)));
  }),
);

// ── Admin: review queue (wallet:read:all to view, wallet:adjust to decide) ──
router.get(
  '/admin/manual-topups',
  requirePermission('wallet:read:all'),
  validate(manualTopupListSchema, 'query'),
  asyncHandler(async (req, res) => {
    res.json(await svc.adminListTopups(valid<ListQuery>(req, 'query')));
  }),
);

router.get(
  '/admin/manual-topups/:id/screenshot',
  requirePermission('wallet:read:all'),
  validate(idParam, 'params'),
  asyncHandler(async (req, res) => {
    const { buffer, mimeType } = await svc.getScreenshot(req.params.id!);
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', 'inline');
    res.send(buffer);
  }),
);

router.post(
  '/admin/manual-topups/:id/approve',
  requirePermission('wallet:adjust'),
  validate(idParam, 'params'),
  validate(manualTopupApproveSchema),
  asyncHandler(async (req, res) => {
    res.json(await svc.approveTopup(req.params.id!, valid<ManualTopupApproveInput>(req), actorOf(req)));
  }),
);

router.post(
  '/admin/manual-topups/:id/reject',
  requirePermission('wallet:adjust'),
  validate(idParam, 'params'),
  validate(manualTopupRejectSchema),
  asyncHandler(async (req, res) => {
    res.json(await svc.rejectTopup(req.params.id!, valid<ManualTopupRejectInput>(req), actorOf(req)));
  }),
);

export default router;
