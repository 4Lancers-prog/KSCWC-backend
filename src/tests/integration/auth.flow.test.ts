// auth.flow.test.ts — signup → approval gating → login → me → logout, plus RBAC/CSRF/audit.
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import type { Express } from 'express';
import { buildApp } from '../../app';
import { prisma } from '../../lib/prisma';
import { resetDb, makeAgent, post, createUser } from '../helpers/test-db';

let app: Express;

const REG = {
  fullName: 'ರಾಮ ಕುಮಾರ',
  phone: '9876500001',
  password: 'supersecret12345',
  centreName: 'Test Centre',
};

beforeAll(() => {
  app = buildApp();
});
beforeEach(async () => {
  await resetDb();
});

describe('registration', () => {
  it('creates a PENDING_APPROVAL account and writes an audit log (AC-01)', async () => {
    const a = await makeAgent(app);
    const res = await post(a, '/api/v1/auth/register', REG);
    expect(res.status).toBe(201);
    expect(res.body.user.accountStatus).toBe('PENDING_APPROVAL');

    const inDb = await prisma.user.findUnique({ where: { phoneNormalized: '9876500001' } });
    expect(inDb).not.toBeNull();
    expect(inDb!.passwordHash).not.toContain('supersecret'); // hashed, not plaintext

    const audit = await prisma.auditLog.findFirst({ where: { action: 'user.register' } });
    expect(audit).not.toBeNull();
  });

  it('rejects invalid phone and duplicate accounts (AC-01)', async () => {
    const a = await makeAgent(app);
    const bad = await post(a, '/api/v1/auth/register', { ...REG, phone: '12345' });
    expect(bad.status).toBe(400);
    expect(bad.body.code).toBe('BAD_REQUEST');

    await post(a, '/api/v1/auth/register', REG);
    const dup = await post(a, '/api/v1/auth/register', REG);
    expect(dup.status).toBe(409);
  });

  it('blocks a request with no CSRF token', async () => {
    const a = await makeAgent(app);
    const res = await a.agent.post('/api/v1/auth/register').send(REG); // no header
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('CSRF_FAILED');
  });
});

describe('login gating (AC-02)', () => {
  it('pending users cannot log in', async () => {
    const a = await makeAgent(app);
    await post(a, '/api/v1/auth/register', REG);
    const res = await post(a, '/api/v1/auth/login', { phone: REG.phone, password: REG.password });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('ACCOUNT_PENDING');
  });

  it('wrong password is rejected uniformly', async () => {
    await createUser({ phone: '9876500002', password: 'rightpassword123' });
    const a = await makeAgent(app);
    const res = await post(a, '/api/v1/auth/login', { phone: '9876500002', password: 'wrongpassword123' });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHORIZED');
  });

  it('approved user can log in, read /me and log out', async () => {
    const user = await createUser({ phone: '9876500003', password: 'rightpassword123', status: 'ACTIVE' });
    const a = await makeAgent(app);
    const login = await post(a, '/api/v1/auth/login', { phone: '9876500003', password: 'rightpassword123' });
    expect(login.status).toBe(200);
    expect(login.body.user.id).toBe(user.id);

    const me = await a.agent.get('/api/v1/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.user.phone).toBe('9876500003');

    const out = await post(a, '/api/v1/auth/logout');
    expect(out.status).toBe(200);

    const after = await a.agent.get('/api/v1/auth/me');
    expect(after.status).toBe(401);
  });
});

describe('admin approval + RBAC (AC-02/AC-03)', () => {
  it('admin approves a pending user who can then log in', async () => {
    // pending user
    const reg = await makeAgent(app);
    const regRes = await post(reg, '/api/v1/auth/register', REG);
    const pendingId = regRes.body.user.id as string;

    // admin logs in
    await createUser({ phone: '9000000001', password: 'adminpassword123', role: 'ADMIN', status: 'ACTIVE' });
    const admin = await makeAgent(app);
    await post(admin, '/api/v1/auth/login', { phone: '9000000001', password: 'adminpassword123' });

    const approve = await post(admin, `/api/v1/admin/users/${pendingId}/approve`);
    expect(approve.status).toBe(200);
    expect(approve.body.user.accountStatus).toBe('ACTIVE');

    // now the previously-pending user can log in
    const u = await makeAgent(app);
    const login = await post(u, '/api/v1/auth/login', { phone: REG.phone, password: REG.password });
    expect(login.status).toBe(200);
  });

  it('a normal user cannot reach admin endpoints (403)', async () => {
    await createUser({ phone: '9876500004', password: 'rightpassword123', status: 'ACTIVE' });
    const a = await makeAgent(app);
    await post(a, '/api/v1/auth/login', { phone: '9876500004', password: 'rightpassword123' });
    const res = await a.agent.get('/api/v1/admin/users');
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  it('unauthenticated access to admin endpoints is 401', async () => {
    const a = await makeAgent(app);
    const res = await a.agent.get('/api/v1/admin/users');
    expect(res.status).toBe(401);
  });
});
