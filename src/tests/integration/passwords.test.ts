// passwords.test.ts — admin-made reset links; change password; "QR not set up" is not an error.
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import type { Express } from 'express';
import { buildApp } from '../../app';
import { resetDb, makeAgent, post, loginAs } from '../helpers/test-db';

let app: Express;
beforeAll(() => { app = buildApp(); });
beforeEach(async () => { await resetDb(); });

describe('admin-assisted password reset', () => {
  it('admin makes a one-time link; operator sets a new password with it; link cannot be reused', async () => {
    const { agent: admin } = await loginAs(app, { phone: '9000000044', role: 'ADMIN' });
    const { userId } = await loginAs(app, { phone: '9845000101', password: 'oldpassword1234' });
    const r = await post(admin, `/api/v1/admin/users/${userId}/password-reset-link`);
    expect(r.status).toBe(200);
    expect(r.body.link).toMatch(/\/reset-password\?token=[0-9a-f]{64}$/);
    const token = new URL(r.body.link).searchParams.get('token')!;

    const visitor = await makeAgent(app);
    expect((await post(visitor, '/api/v1/auth/reset-password', { token, password: 'brandnewpassword1' })).status).toBe(200);
    expect((await post(visitor, '/api/v1/auth/reset-password', { token, password: 'anotherpassword12' })).status).toBe(400); // single use

    const fresh = await makeAgent(app);
    expect((await post(fresh, '/api/v1/auth/login', { phone: '9845000101', password: 'oldpassword1234' })).status).toBe(401);
    expect((await post(fresh, '/api/v1/auth/login', { phone: '9845000101', password: 'brandnewpassword1' })).status).toBe(200);
  });

  it('operators cannot make reset links', async () => {
    const { agent: op, userId } = await loginAs(app, { phone: '9845000102' });
    expect((await post(op, `/api/v1/admin/users/${userId}/password-reset-link`)).status).toBe(403);
  });
});

describe('change password', () => {
  it('needs the right current password; keeps this login, signs out other sessions', async () => {
    const { agent: me } = await loginAs(app, { role: 'ADMIN', phone: '9000000045', password: 'currentpassword1' });
    const other = await makeAgent(app);
    await post(other, '/api/v1/auth/login', { phone: '9000000045', password: 'currentpassword1' }); // a 2nd browser (staff: allowed)
    expect((await other.agent.get('/api/v1/auth/me')).status).toBe(200);

    const wrong = await post(me, '/api/v1/auth/change-password', { currentPassword: 'nope', newPassword: 'newpassword12345' });
    expect(wrong.status).toBe(400);
    expect(wrong.body.code).toBe('WRONG_PASSWORD');
    const weak = await post(me, '/api/v1/auth/change-password', { currentPassword: 'currentpassword1', newPassword: 'short' });
    expect(weak.status).toBe(400);

    expect((await post(me, '/api/v1/auth/change-password', { currentPassword: 'currentpassword1', newPassword: 'newpassword12345' })).status).toBe(200);
    expect((await me.agent.get('/api/v1/auth/me')).status).toBe(200);    // still logged in here
    expect((await other.agent.get('/api/v1/auth/me')).status).toBe(401); // other browser signed out
  });
});

describe('payment QR not set up', () => {
  it('is a normal answer, not an error', async () => {
    const { agent: op } = await loginAs(app, { phone: '9845000103' });
    const r = await op.agent.get('/api/v1/payment-qr');
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ configured: false });
  });
});
