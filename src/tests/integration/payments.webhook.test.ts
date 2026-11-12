// payments.webhook.test.ts — credit exactly once across callback + webhook, bad signatures rejected (AC-06/07).
import crypto from 'node:crypto';
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import type { Express } from 'express';
import { buildApp } from '../../app';
import { prisma } from '../../lib/prisma';
import { resetDb, loginAs, post } from '../helpers/test-db';

const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET ?? 'placeholder';
const WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET ?? 'placeholder_webhook_secret';

let app: Express;
beforeAll(() => {
  app = buildApp();
});
beforeEach(async () => {
  await resetDb();
});

const checkoutSig = (orderId: string, paymentId: string) =>
  crypto.createHmac('sha256', KEY_SECRET).update(`${orderId}|${paymentId}`).digest('hex');

async function balanceOf(userId: string) {
  return Number((await prisma.walletAccount.findUniqueOrThrow({ where: { userId } })).balancePaise);
}

async function newTopup(agent: Awaited<ReturnType<typeof loginAs>>) {
  const res = await post(agent.agent, '/api/v1/wallet/topups', { amountPaise: 50000 });
  expect(res.status).toBe(201);
  return res.body.razorpayOrderId as string;
}

function webhook(orderId: string, eventId: string, event = 'payment.captured') {
  const payload = JSON.stringify({ event, payload: { payment: { entity: { id: `pay_${eventId}`, order_id: orderId } } } });
  const sig = crypto.createHmac('sha256', WEBHOOK_SECRET).update(payload).digest('hex');
  return { payload, sig, eventId };
}

describe('top-up credit-once (AC-06)', () => {
  it('a verified callback credits exactly once; duplicate callback does not double-credit', async () => {
    const a = await loginAs(app, { phone: '9700001001' });
    const orderId = await newTopup(a);

    const first = await post(a.agent, '/api/v1/payments/verify', {
      razorpayOrderId: orderId, razorpayPaymentId: 'pay_1', razorpaySignature: checkoutSig(orderId, 'pay_1'),
    });
    expect(first.status).toBe(200);
    expect(first.body.alreadyCredited).toBe(false);
    expect(await balanceOf(a.userId)).toBe(50000);

    const second = await post(a.agent, '/api/v1/payments/verify', {
      razorpayOrderId: orderId, razorpayPaymentId: 'pay_1', razorpaySignature: checkoutSig(orderId, 'pay_1'),
    });
    expect(second.body.alreadyCredited).toBe(true);
    expect(await balanceOf(a.userId)).toBe(50000);
  });

  it('callback + webhook in either order credit only once', async () => {
    const a = await loginAs(app, { phone: '9700001002' });
    const orderId = await newTopup(a);
    const wh = webhook(orderId, 'evt1');

    // webhook first
    const r1 = await a.agent
      .post('/api/v1/payments/razorpay/webhook')
      .set('Content-Type', 'application/json')
      .set('x-razorpay-signature', wh.sig)
      .set('x-razorpay-event-id', wh.eventId)
      .send(wh.payload);
    expect(r1.status).toBe(200);
    expect(await balanceOf(a.userId)).toBe(50000);

    // then the callback
    const cb = await post(a.agent, '/api/v1/payments/verify', {
      razorpayOrderId: orderId, razorpayPaymentId: 'pay_x', razorpaySignature: checkoutSig(orderId, 'pay_x'),
    });
    expect(cb.body.alreadyCredited).toBe(true);
    expect(await balanceOf(a.userId)).toBe(50000);
  });

  it('a duplicate webhook delivery is ignored', async () => {
    const a = await loginAs(app, { phone: '9700001003' });
    const orderId = await newTopup(a);
    const wh = webhook(orderId, 'evt-dup');
    const send = () =>
      a.agent.post('/api/v1/payments/razorpay/webhook')
        .set('Content-Type', 'application/json')
        .set('x-razorpay-signature', wh.sig)
        .set('x-razorpay-event-id', wh.eventId)
        .send(wh.payload);
    await send();
    const again = await send();
    expect(again.body.duplicate).toBe(true);
    expect(await balanceOf(a.userId)).toBe(50000);
  });
});

describe('invalid / failed payments never credit (AC-07)', () => {
  it('rejects an invalid checkout signature', async () => {
    const a = await loginAs(app, { phone: '9700002001' });
    const orderId = await newTopup(a);
    const res = await post(a.agent, '/api/v1/payments/verify', {
      razorpayOrderId: orderId, razorpayPaymentId: 'pay_1', razorpaySignature: 'deadbeef',
    });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_SIGNATURE');
    expect(await balanceOf(a.userId)).toBe(0);
  });

  it('rejects a webhook with a bad signature', async () => {
    const a = await loginAs(app, { phone: '9700002002' });
    const orderId = await newTopup(a);
    const payload = JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: { id: 'p', order_id: orderId } } } });
    const res = await a.agent
      .post('/api/v1/payments/razorpay/webhook')
      .set('Content-Type', 'application/json')
      .set('x-razorpay-signature', 'bad')
      .set('x-razorpay-event-id', 'evtbad')
      .send(payload);
    expect(res.status).toBe(400);
    expect(await balanceOf(a.userId)).toBe(0);
  });

  it('a payment.failed webhook marks the order FAILED and does not credit', async () => {
    const a = await loginAs(app, { phone: '9700002003' });
    const orderId = await newTopup(a);
    const wh = webhook(orderId, 'evtfail', 'payment.failed');
    await a.agent
      .post('/api/v1/payments/razorpay/webhook')
      .set('Content-Type', 'application/json')
      .set('x-razorpay-signature', wh.sig)
      .set('x-razorpay-event-id', wh.eventId)
      .send(wh.payload);
    expect(await balanceOf(a.userId)).toBe(0);
    const order = await prisma.paymentOrder.findUniqueOrThrow({ where: { razorpayOrderId: orderId } });
    expect(order.status).toBe('FAILED');
  });
});
