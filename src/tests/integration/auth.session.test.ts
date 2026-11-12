// auth.session.test.ts — password reset invalidates existing sessions; new password works.
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import type { Express } from 'express';
import { buildApp } from '../../app';
import { resetDb, makeAgent, post, createUser } from '../helpers/test-db';

let app: Express;
beforeAll(() => {
  app = buildApp();
});
beforeEach(async () => {
  await resetDb();
});

describe('password reset session invalidation', () => {
  it('logs out existing sessions and lets the user sign in with the new password', async () => {
    await createUser({ phone: '9700500001', password: 'rightpassword123', status: 'ACTIVE' });

    // session A: logged in
    const a = await makeAgent(app);
    await post(a, '/api/v1/auth/login', { phone: '9700500001', password: 'rightpassword123' });
    expect((await a.agent.get('/api/v1/auth/me')).status).toBe(200);

    // request + perform reset (dev token is returned in non-prod)
    const fp = await post(a, '/api/v1/auth/forgot-password', { phone: '9700500001' });
    const token = fp.body.devToken as string;
    expect(token).toBeTruthy();
    const rp = await post(a, '/api/v1/auth/reset-password', { token, password: 'brandnewpass12345' });
    expect(rp.status).toBe(200);

    // session A is now invalid
    expect((await a.agent.get('/api/v1/auth/me')).status).toBe(401);

    // old password no longer works; new one does
    const b = await makeAgent(app);
    expect((await post(b, '/api/v1/auth/login', { phone: '9700500001', password: 'rightpassword123' })).status).toBe(401);
    expect((await post(b, '/api/v1/auth/login', { phone: '9700500001', password: 'brandnewpass12345' })).status).toBe(200);
  });
});
