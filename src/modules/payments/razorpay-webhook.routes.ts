// razorpay-webhook.routes.ts — mounted with express.raw (raw body) BEFORE json + CSRF.
// Verifies the webhook HMAC on the raw bytes, then processes captured/failed idempotently.
import { Router } from 'express';
import { asyncHandler } from '../../middleware/async-handler';
import { logger } from '../../lib/logger';
import { verifyWebhookSignature } from './razorpay.client';
import {
  creditCapturedOrder,
  markOrderFailed,
  recordWebhookEvent,
  finishWebhookEvent,
  discardWebhookEvent,
} from './payments.service';

const router = Router();

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const raw: Buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body ?? {}));
    const signature = req.header('x-razorpay-signature') ?? '';

    if (!verifyWebhookSignature(raw, signature)) {
      logger.warn({ requestId: req.requestId }, 'razorpay webhook: bad signature');
      return res.status(400).json({ code: 'INVALID_SIGNATURE', message: 'Bad signature' });
    }

    let event: {
      event?: string;
      payload?: { payment?: { entity?: { id?: string; order_id?: string } } };
    };
    try {
      event = JSON.parse(raw.toString('utf8'));
    } catch {
      return res.status(400).json({ code: 'BAD_REQUEST', message: 'Invalid JSON' });
    }

    // Prefer Razorpay's event id header for idempotency; fall back to a composite.
    const payment = event.payload?.payment?.entity;
    const eventType = event.event ?? 'unknown';
    const providerEventId =
      req.header('x-razorpay-event-id') ?? `${eventType}:${payment?.id ?? 'noid'}`;

    const isNew = await recordWebhookEvent(providerEventId, eventType, true, {
      event: eventType,
      orderId: payment?.order_id ?? null,
      paymentId: payment?.id ?? null,
    });
    if (!isNew) return res.status(200).json({ ok: true, duplicate: true });

    try {
      if (eventType === 'payment.captured' && payment?.order_id) {
        await creditCapturedOrder(payment.order_id);
      } else if (eventType === 'payment.failed' && payment?.order_id) {
        await markOrderFailed(payment.order_id);
      }
      await finishWebhookEvent(providerEventId);
    } catch (err) {
      logger.error({ err, providerEventId }, 'razorpay webhook processing failed');
      // Remove the guard row so Razorpay's retry reprocesses; credit is idempotent regardless.
      await discardWebhookEvent(providerEventId);
      return res.status(500).json({ code: 'INTERNAL', message: 'processing failed' });
    }

    return res.status(200).json({ ok: true });
  }),
);

export default router;
