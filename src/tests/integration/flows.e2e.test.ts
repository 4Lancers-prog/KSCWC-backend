// flows.e2e.test.ts — end-to-end journeys over HTTP (AC spanning signup→report→wallet→content).
import crypto from 'node:crypto';
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import type { Express } from 'express';
import { buildApp } from '../../app';
import { prisma } from '../../lib/prisma';
import { resetDb, makeAgent, post, createUser, createService, loginAs } from '../helpers/test-db';

const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET ?? 'placeholder';
let app: Express;
beforeAll(() => { app = buildApp(); });
beforeEach(async () => { await resetDb(); });

describe('operator journey: signup → approval → login → customer → report', () => {
  it('runs end to end', async () => {
    await createService({ code: 'PAN_CARD' });
    const svc = await prisma.service.findFirstOrThrow();

    // signup
    const guest = await makeAgent(app);
    const reg = await post(guest, '/api/v1/auth/register', {
      fullName: 'ಮಂಜು', phone: '9811100001', password: 'operatorpass12345',
    });
    expect(reg.status).toBe(201);
    const userId = reg.body.user.id;

    // admin approves
    await createUser({ phone: '9000000099', password: 'adminpass123456', role: 'ADMIN', status: 'ACTIVE' });
    const admin = await makeAgent(app);
    await post(admin, '/api/v1/auth/login', { phone: '9000000099', password: 'adminpass123456' });
    expect((await post(admin, `/api/v1/admin/users/${userId}/approve`)).status).toBe(200);

    // operator logs in, adds a customer, sees it in their report
    const op = await makeAgent(app);
    expect((await post(op, '/api/v1/auth/login', { phone: '9811100001', password: 'operatorpass12345' })).status).toBe(200);
    const cust = await post(op, '/api/v1/customers', { fullName: 'ಗ್ರಾಹಕ', mobile: '9822200002', serviceId: svc.id, feePaise: 5000 });
    expect(cust.status).toBe(201);
    const report = await op.agent.get('/api/v1/reports/my-customers');
    expect(report.body.totals.total).toBe(1);
    expect(report.body.totals.feeTotalPaise).toBe(5000);
  });
});

describe('wallet journey: top-up → verify → balance', () => {
  it('credits the wallet after a verified payment', async () => {
    const op = await loginAs(app, { phone: '9811100010' });
    const topup = await post(op.agent, '/api/v1/wallet/topups', { amountPaise: 20000 });
    const orderId = topup.body.razorpayOrderId as string;
    const sig = crypto.createHmac('sha256', KEY_SECRET).update(`${orderId}|pay_e2e`).digest('hex');
    const verify = await post(op.agent, '/api/v1/payments/verify', {
      razorpayOrderId: orderId, razorpayPaymentId: 'pay_e2e', razorpaySignature: sig,
    });
    expect(verify.status).toBe(200);
    const wallet = await op.agent.get('/api/v1/wallet');
    expect(wallet.body.balancePaise).toBe(20000);
  });
});

describe('content journey: admin publish → public display (AC-11)', () => {
  it('shows a published announcement on the public endpoint', async () => {
    const admin = await loginAs(app, { phone: '9000000098', role: 'ADMIN' });
    await post(admin.agent, '/api/v1/admin/announcements', { title: 'ಸಾರ್ವಜನಿಕ ಸೂಚನೆ', status: 'PUBLISHED' });
    const pub = await (await makeAgent(app)).agent.get('/api/v1/public/announcements');
    expect(pub.body.items.some((i: { title: string }) => i.title === 'ಸಾರ್ವಜನಿಕ ಸೂಚನೆ')).toBe(true);
  });
});
