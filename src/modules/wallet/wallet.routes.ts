// wallet.routes.ts — user wallet (balance, ledger, top-up) + admin wallet management.
import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../middleware/async-handler';
import { requireAuth } from '../../middleware/require-auth';
import { requirePermission } from '../../middleware/require-role';
import { validate, valid } from '../../middleware/validate';
import { paginationSchema } from '../../shared/schemas/common.schema';
import {
  topupCreateSchema,
  adminAdjustSchema,
  ledgerFilterSchema,
  type TopupCreateInput,
  type AdminAdjustInput,
} from '../../shared/schemas/wallet.schema';
import { resolvePage, paginate } from '../../common/utils/pagination';
import * as wallet from './wallet.service';
import { createTopupOrder } from '../payments/payments.service';

const router = Router();
const actorOf = (req: import('express').Request) => ({ id: req.user!.id, requestId: req.requestId, ip: req.ip });

router.get(
  '/wallet',
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json(await wallet.getWallet(req.user!.id));
  }),
);

router.get(
  '/wallet/transactions',
  requireAuth,
  validate(ledgerFilterSchema, 'query'),
  asyncHandler(async (req, res) => {
    const q = valid<z.infer<typeof ledgerFilterSchema>>(req, 'query');
    res.json(await wallet.listTransactions(req.user!.id, q));
  }),
);

// Create a Razorpay order for a top-up (server-held credentials).
router.post(
  '/wallet/topups',
  requireAuth,
  validate(topupCreateSchema),
  asyncHandler(async (req, res) => {
    const { amountPaise } = valid<TopupCreateInput>(req);
    res.status(201).json(await createTopupOrder(req.user!.id, amountPaise));
  }),
);

// ── Admin wallet management ──
router.get(
  '/admin/wallets',
  requirePermission('wallet:read:all'),
  validate(paginationSchema.extend({ search: z.string().trim().max(120).optional() }), 'query'),
  asyncHandler(async (req, res) => {
    const q = valid<{ page?: number; limit?: number; search?: string }>(req, 'query');
    const page = resolvePage(q.page, q.limit);
    const { items, total } = await wallet.adminListWallets(page, q.search);
    res.json(paginate(items, total, page));
  }),
);

router.post(
  '/admin/wallets/:userId/adjustments',
  requirePermission('wallet:adjust'),
  validate(z.object({ userId: z.string().uuid() }), 'params'),
  validate(adminAdjustSchema),
  asyncHandler(async (req, res) => {
    const result = await wallet.adminAdjust(req.params.userId, valid<AdminAdjustInput>(req), actorOf(req));
    res.status(201).json(result);
  }),
);

export default router;
