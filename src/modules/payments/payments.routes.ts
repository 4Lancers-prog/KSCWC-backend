// payments.routes.ts — Checkout verification + order status. No public "mark captured" exists.
import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../middleware/async-handler';
import { requireAuth } from '../../middleware/require-auth';
import { validate, valid } from '../../middleware/validate';
import { checkoutVerifySchema, type CheckoutVerifyInput } from '../../shared/schemas/wallet.schema';
import * as payments from './payments.service';

const router = Router();
const ctxOf = (req: import('express').Request) => ({ requestId: req.requestId, ip: req.ip });

router.post(
  '/payments/verify',
  requireAuth,
  validate(checkoutVerifySchema),
  asyncHandler(async (req, res) => {
    const input = valid<CheckoutVerifyInput>(req);
    const result = await payments.verifyAndCredit(req.user!.id, input, ctxOf(req));
    res.json({ status: 'CAPTURED', alreadyCredited: result.alreadyCredited });
  }),
);

router.get(
  '/payments/:id/status',
  requireAuth,
  validate(z.object({ id: z.string().uuid() }), 'params'),
  asyncHandler(async (req, res) => {
    res.json(await payments.getOrderStatus(req.params.id, req.user!.id));
  }),
);

export default router;
