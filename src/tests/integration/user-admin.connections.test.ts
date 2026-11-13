// user-admin.connections.test.ts — the round trips between an operator and the admin console.
// Regression guard for the login bug: session.regenerate() replaced req.session, so userId was
// written to a discarded object and every request after login was anonymous.
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import type { Express } from 'express';
import { buildApp } from '../../app';
import { resetDb, makeAgent, post, loginAs } from '../helpers/test-db';

let app: Express;
beforeAll(() => {
  app = buildApp();
});
beforeEach(async () => {
  await resetDb();
});

const OP = { fullName: 'Ravi Kumar', phone: '9876543210', password: 'UserPassword123', centreName: 'Ravi CSC' };

describe('operator ↔ admin', () => {
  it('login keeps the session (GET /auth/me works right after login)', async () => {
    const { agent } = await loginAs(app, { phone: '9000000077', role: 'SUPER_ADMIN' });
    const me = await agent.agent.get('/api/v1/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.user.role).toBe('SUPER_ADMIN');
  });

  it('a sign-up reaches the admin queue; approval lets the operator in', async () => {
    const { agent: admin } = await loginAs(app, { phone: '9000000077', role: 'SUPER_ADMIN' });
    const op = await makeAgent(app);
    expect((await post(op, '/api/v1/auth/register', OP)).status).toBe(201);

    const ov = await admin.agent.get('/api/v1/admin/overview');
    expect(ov.status).toBe(200);
    expect(ov.body.pendingUsers).toBe(1);

    const list = await admin.agent.get('/api/v1/admin/users?status=PENDING_APPROVAL');
    expect(list.body.items.map((u: { centreName: string }) => u.centreName)).toEqual(['Ravi CSC']);
    const id = list.body.items[0].id as string;

    expect((await post(op, '/api/v1/auth/login', { phone: OP.phone, password: OP.password })).body.code).toBe('ACCOUNT_PENDING');
    expect((await post(admin, `/api/v1/admin/users/${id}/approve`)).status).toBe(200);

    expect((await post(op, '/api/v1/auth/login', { phone: OP.phone, password: OP.password })).status).toBe(200);
    expect((await op.agent.get('/api/v1/auth/me')).status).toBe(200);
    expect((await op.agent.get('/api/v1/wallet')).status).toBe(200);
    expect((await op.agent.get('/api/v1/admin/overview')).status).toBe(403);
  });

  it('rejection and suspension reasons are shown to the operator at login', async () => {
    const { agent: admin } = await loginAs(app, { phone: '9000000077', role: 'SUPER_ADMIN' });
    const op = await makeAgent(app);
    await post(op, '/api/v1/auth/register', OP);
    const id = (await admin.agent.get('/api/v1/admin/users?status=PENDING_APPROVAL')).body.items[0].id;
    await post(admin, `/api/v1/admin/users/${id}/approve`);
    await post(admin, `/api/v1/admin/users/${id}/suspend`, { reason: 'Duplicate centre' });
    const res = await post(op, '/api/v1/auth/login', { phone: OP.phone, password: OP.password });
    expect(res.body.code).toBe('ACCOUNT_SUSPENDED');
    expect(res.body.message).toContain('Duplicate centre');
  });

  it('admin grievance decision + note flows back to the operator', async () => {
    const { agent: admin } = await loginAs(app, { phone: '9000000077', role: 'SUPER_ADMIN' });
    const { agent: op } = await loginAs(app, { phone: '9876543210' });
    const g = await post(op, '/api/v1/applications/grievance', {
      name: 'Ravi', phone: '9876543210', category: 'Wallet', details: 'Not credited',
    });
    expect(g.status).toBe(201);
    expect((await admin.agent.get('/api/v1/admin/overview')).body.openGrievances).toBe(1);

    await post(admin, `/api/v1/admin/applications/grievances/${g.body.id}/status`, {
      status: 'RESOLVED', resolutionNote: 'Credited manually',
    });
    const mine = await op.agent.get('/api/v1/me/applications');
    expect(mine.status).toBe(200);
    expect(mine.body.grievances[0]).toMatchObject({ status: 'RESOLVED', resolutionNote: 'Credited manually' });
  });
});
