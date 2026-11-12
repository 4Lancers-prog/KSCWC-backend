// razorpay.client.ts — server-held Razorpay access + signature verification.
// Secrets never leave the server. In mock mode (placeholder secret or NODE_ENV=test) no
// network call is made, so signature logic can be tested deterministically offline.
import crypto from 'node:crypto';
import Razorpay from 'razorpay';
import { nanoid } from 'nanoid';
import { env, isTest } from '../../config/env';

export const MOCK_PAYMENTS = isTest || env.RAZORPAY_KEY_SECRET === 'placeholder';

const client = MOCK_PAYMENTS
  ? null
  : new Razorpay({ key_id: env.RAZORPAY_KEY_ID, key_secret: env.RAZORPAY_KEY_SECRET });

export interface RzOrder {
  id: string;
  amount: number;
  currency: string;
  receipt: string;
}

export async function createRazorpayOrder(amountPaise: number, receipt: string): Promise<RzOrder> {
  if (MOCK_PAYMENTS || !client) {
    return { id: `order_mock_${nanoid(14)}`, amount: amountPaise, currency: 'INR', receipt };
  }
  const order = await client.orders.create({ amount: amountPaise, currency: 'INR', receipt });
  return { id: order.id, amount: Number(order.amount), currency: order.currency, receipt };
}

/** Verify Razorpay Checkout callback: HMAC_SHA256(order_id|payment_id, key_secret). */
export function verifyCheckoutSignature(orderId: string, paymentId: string, signature: string): boolean {
  const expected = crypto
    .createHmac('sha256', env.RAZORPAY_KEY_SECRET)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');
  return safeEqual(expected, signature);
}

/** Verify a webhook: HMAC_SHA256(rawBody, webhook_secret) against X-Razorpay-Signature. */
export function verifyWebhookSignature(rawBody: Buffer | string, signature: string): boolean {
  const expected = crypto
    .createHmac('sha256', env.RAZORPAY_WEBHOOK_SECRET)
    .update(rawBody)
    .digest('hex');
  return safeEqual(expected, signature);
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

export const publicKeyId = env.RAZORPAY_KEY_ID;

/** Reconciliation helper: is this order paid according to Razorpay? (false in mock mode). */
export async function fetchOrderPaid(orderId: string): Promise<boolean> {
  if (MOCK_PAYMENTS || !client) return false;
  const order = await client.orders.fetch(orderId);
  return order.status === 'paid';
}
