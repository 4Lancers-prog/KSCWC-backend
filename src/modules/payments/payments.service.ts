// payments.service.ts — Razorpay order creation + the single credit-once path shared by the
// Checkout callback and the webhook. A wallet is credited for an order at most once, whichever
// path (callback or webhook, in any order, delivered any number of times) arrives.
import { nanoid } from 'nanoid';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { env } from '../../config/env';
import { AppError } from '../../common/errors/app-error';
import { postLedgerEntry } from '../wallet/wallet-ledger.service';
import { writeAudit } from '../audit/audit.service';
import { createRazorpayOrder, verifyCheckoutSignature, publicKeyId, fetchOrderPaid } from './razorpay.client';
import { logger } from '../../lib/logger';

export async function createTopupOrder(userId: string, amountPaise: number) {
  if (amountPaise < env.WALLET_TOPUP_MIN_PAISE || amountPaise > env.WALLET_TOPUP_MAX_PAISE) {
    throw AppError.badRequest(
      `Top-up must be between ₹${env.WALLET_TOPUP_MIN_PAISE / 100} and ₹${env.WALLET_TOPUP_MAX_PAISE / 100}`,
      [{ field: 'amountPaise', message: 'Amount out of allowed range' }],
    );
  }
  const receipt = `rcpt_${nanoid(18)}`;
  const rz = await createRazorpayOrder(amountPaise, receipt);
  const order = await prisma.paymentOrder.create({
    data: {
      userId,
      razorpayOrderId: rz.id,
      amountPaise: BigInt(amountPaise),
      currency: 'INR',
      status: 'CREATED',
      receiptReference: receipt,
    },
  });
  return {
    paymentOrderId: order.id,
    razorpayOrderId: rz.id,
    amountPaise,
    currency: 'INR',
    keyId: publicKeyId, // public key id only — never the secret
  };
}

interface CreditResult {
  alreadyCredited: boolean;
  paymentOrderId: string;
  walletTransactionId?: string;
}

/** Idempotently credit the wallet for a captured order. Safe under concurrent callers. */
export async function creditCapturedOrder(razorpayOrderId: string): Promise<CreditResult> {
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<
      { id: string; status: string; amount_paise: bigint; user_id: string }[]
    >`SELECT id, status, amount_paise, user_id FROM payment_orders WHERE razorpay_order_id = ${razorpayOrderId} FOR UPDATE`;
    if (rows.length === 0) throw AppError.notFound('Payment order not found');
    const order = rows[0]!;

    if (order.status === 'CAPTURED') {
      return { alreadyCredited: true, paymentOrderId: order.id };
    }

    const txn = await postLedgerEntry(tx, {
      userId: order.user_id,
      type: 'TOPUP',
      direction: 'CREDIT',
      amountPaise: Number(order.amount_paise),
      idempotencyKey: `topup:${order.id}`, // unique → credited once even on races
      referenceType: 'payment_order',
      referenceId: order.id,
      description: 'Wallet top-up',
    });

    await tx.paymentOrder.update({
      where: { id: order.id },
      data: { status: 'CAPTURED', capturedAt: new Date(), walletTransactionId: txn.id },
    });

    return { alreadyCredited: false, paymentOrderId: order.id, walletTransactionId: txn.id };
  });
}

export async function markOrderFailed(razorpayOrderId: string): Promise<void> {
  await prisma.paymentOrder.updateMany({
    where: { razorpayOrderId, status: { in: ['CREATED', 'AUTHORIZED'] } },
    data: { status: 'FAILED' },
  });
}

/** Verify the Checkout callback signature, then credit once. */
export async function verifyAndCredit(
  userId: string,
  input: { razorpayOrderId: string; razorpayPaymentId: string; razorpaySignature: string },
  ctx: { requestId?: string; ip?: string | null },
): Promise<CreditResult> {
  const order = await prisma.paymentOrder.findUnique({ where: { razorpayOrderId: input.razorpayOrderId } });
  if (!order || order.userId !== userId) throw AppError.notFound('Payment order not found');

  const ok = verifyCheckoutSignature(input.razorpayOrderId, input.razorpayPaymentId, input.razorpaySignature);
  if (!ok) {
    await writeAudit({
      actorUserId: userId,
      action: 'payment.signature_invalid',
      entityType: 'payment_order',
      entityId: order.id,
      requestId: ctx.requestId,
      ip: ctx.ip,
    });
    throw new AppError(400, 'INVALID_SIGNATURE', 'Payment verification failed');
  }

  const result = await creditCapturedOrder(input.razorpayOrderId);
  if (!result.alreadyCredited) {
    await writeAudit({
      actorUserId: userId,
      action: 'wallet.topup_credited',
      entityType: 'payment_order',
      entityId: order.id,
      requestId: ctx.requestId,
      ip: ctx.ip,
      after: { via: 'checkout', walletTransactionId: result.walletTransactionId },
    });
  }
  return result;
}

export async function getOrderStatus(paymentOrderId: string, userId: string) {
  const order = await prisma.paymentOrder.findUnique({ where: { id: paymentOrderId } });
  if (!order || order.userId !== userId) throw AppError.notFound('Payment order not found');
  return {
    paymentOrderId: order.id,
    status: order.status,
    amountPaise: Number(order.amountPaise),
    capturedAt: order.capturedAt,
    walletTransactionId: order.walletTransactionId,
  };
}

/** Record a webhook event idempotently; returns false if it was already processed. */
export async function recordWebhookEvent(
  providerEventId: string,
  eventType: string,
  signatureVerified: boolean,
  payloadRedacted: Prisma.InputJsonValue,
): Promise<boolean> {
  try {
    await prisma.paymentEvent.create({
      data: { providerEventId, eventType, signatureVerified, payloadRedacted, processingStatus: 'PROCESSING' },
    });
    return true;
  } catch (err) {
    if (err instanceof Error && 'code' in err && (err as { code?: string }).code === 'P2002') {
      return false; // duplicate delivery → already handled
    }
    throw err;
  }
}

/**
 * Reconcile orders that never completed via callback/webhook (e.g. the browser closed before
 * the callback, and the webhook was missed). Credits any that Razorpay reports as paid.
 * Safe to run repeatedly: creditCapturedOrder is idempotent.
 */
export async function reconcilePendingPayments(olderThanMs = 10 * 60 * 1000): Promise<{ checked: number; credited: number }> {
  const cutoff = new Date(Date.now() - olderThanMs);
  const pending = await prisma.paymentOrder.findMany({
    where: { status: { in: ['CREATED', 'AUTHORIZED'] }, createdAt: { lt: cutoff } },
    take: 100,
  });
  let credited = 0;
  for (const order of pending) {
    try {
      if (await fetchOrderPaid(order.razorpayOrderId)) {
        const r = await creditCapturedOrder(order.razorpayOrderId);
        if (!r.alreadyCredited) credited += 1;
      }
    } catch (err) {
      logger.warn({ err, orderId: order.razorpayOrderId }, 'reconciliation: could not check order');
    }
  }
  if (pending.length) logger.info({ checked: pending.length, credited }, 'payment reconciliation run');
  return { checked: pending.length, credited };
}

export async function finishWebhookEvent(providerEventId: string): Promise<void> {
  await prisma.paymentEvent.updateMany({
    where: { providerEventId },
    data: { processingStatus: 'DONE', processedAt: new Date() },
  });
}

/**
 * Called when processing threw. We remove the event row so Razorpay's retry can reprocess.
 * This cannot double-credit: creditCapturedOrder is idempotent (order lock + unique ledger key).
 */
export async function discardWebhookEvent(providerEventId: string): Promise<void> {
  await prisma.paymentEvent.deleteMany({ where: { providerEventId } });
}
