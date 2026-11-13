// flows.e2e.test.ts — end-to-end journeys over HTTP (AC spanning signup→report→wallet→content).
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import type { Express } from 'express';
import { buildApp } from '../../app';
import { resetDb, makeAgent, post, createUser, createService, loginAs } from '../helpers/test-db';

let app: Express;
beforeAll(() => { app = buildApp(); });
beforeEach(async () => { await resetDb(); });

describe('operator journey: signup → approval → login → customer → report', () => {
  it('runs end to end', async () => {
    const svc = await createService({ code: 'PAN_CARD' });

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

describe('wallet journey: UPI payment → UTR → admin approval → balance → FID charge', () => {
  it('credits only after admin approval, exactly once, and the UTR cannot be reused', async () => {
    const op = await loginAs(app, { phone: '9811100010' });
    const admin = await loginAs(app, { phone: '9000000097', role: 'ADMIN' });

    const sub = await post(op.agent, '/api/v1/wallet/manual-topups', { amountPaise: 20000, utrNumber: '412345678901' });
    expect(sub.body).toMatchObject({ status: 'PENDING' });
    expect(sub.status).toBe(201);
    expect((await op.agent.get('/api/v1/wallet')).body.balancePaise).toBe(0); // nothing until approved

    // same UTR again → refused
    const dup = await post(op.agent, '/api/v1/wallet/manual-topups', { amountPaise: 20000, utrNumber: '412345678901' });
    expect(dup.status).toBe(409);

    // two admins approve at the same moment → credited once
    const [a1, a2] = await Promise.all([
      post(admin.agent, `/api/v1/admin/manual-topups/${sub.body.id}/approve`, {}),
      post(admin.agent, `/api/v1/admin/manual-topups/${sub.body.id}/approve`, {}),
    ]);
    expect([a1.status, a2.status].sort()).toEqual([200, 409]);
    expect((await op.agent.get('/api/v1/wallet')).body.balancePaise).toBe(20000);

    // rejecting after approval is refused
    expect((await post(admin.agent, `/api/v1/admin/manual-topups/${sub.body.id}/reject`, { reason: 'late' })).status).toBe(409);
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
