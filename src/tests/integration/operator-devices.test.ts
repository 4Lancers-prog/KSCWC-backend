// operator-devices.test.ts — operators: max 2 devices, one signed in at a time; staff unlimited.
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import type { Express } from 'express';
import { buildApp } from '../../app';
import { User } from '../../db/models';
import { resetDb, makeAgent, post, createUser, loginAs, type Agent } from '../helpers/test-db';

let app: Express;
beforeAll(() => {
  app = buildApp();
});
beforeEach(async () => {
  await resetDb();
});

const PHONE = '9845000001';
const PASSWORD = 'operatorpass12345';
const login = (a: Agent) => post(a, '/api/v1/auth/login', { phone: PHONE, password: PASSWORD });
const me = (a: Agent) => a.agent.get('/api/v1/auth/me');
/** Pretend the active device has been idle for longer than the allowed window. */
const makeIdle = (userId: string) =>
  User.updateOne({ _id: userId }, { $set: { 'activeSession.lastSeenAt': new Date(Date.now() - 31 * 60_000) } });

describe('operator device rules', () => {
  it('blocks a second device while the first is signed in, until it logs out', async () => {
    await createUser({ phone: PHONE, password: PASSWORD });
    const pc = await makeAgent(app);
    const phone = await makeAgent(app);

    expect((await login(pc)).status).toBe(200);
    const blocked = await login(phone);
    expect(blocked.status).toBe(409);
    expect(blocked.body.code).toBe('ACTIVE_ON_OTHER_DEVICE');
    expect((await me(pc)).status).toBe(200); // the first device is untouched

    await post(pc, '/api/v1/auth/logout');
    expect((await login(phone)).status).toBe(200); // slot freed by logout
  });

  it('same device can sign in again (new tab / expired cookie)', async () => {
    await createUser({ phone: PHONE, password: PASSWORD });
    const pc = await makeAgent(app);
    expect((await login(pc)).status).toBe(200);
    const pcAgain = await makeAgent(app);
    pcAgain.deviceId = pc.deviceId; // same browser, fresh cookie
    expect((await login(pcAgain)).status).toBe(200);
  });

  it('an idle device can be taken over; the old device is then signed out with SESSION_ENDED', async () => {
    const u = await createUser({ phone: PHONE, password: PASSWORD });
    const pc = await makeAgent(app);
    const phone = await makeAgent(app);
    await login(pc);
    await makeIdle(u.id);

    expect((await login(phone)).status).toBe(200);
    const old = await me(pc);
    expect(old.status).toBe(401);
    expect(old.body.code).toBe('SESSION_ENDED');
    expect((await me(phone)).status).toBe(200);
  });

  it('allows at most 2 devices; a 3rd is refused until an admin removes one', async () => {
    const u = await createUser({ phone: PHONE, password: PASSWORD });
    const [d1, d2, d3] = [await makeAgent(app), await makeAgent(app), await makeAgent(app)];
    await login(d1);
    await post(d1, '/api/v1/auth/logout');
    await login(d2);
    await post(d2, '/api/v1/auth/logout');

    const third = await login(d3);
    expect(third.status).toBe(403);
    expect(third.body.code).toBe('DEVICE_LIMIT');

    const { agent: admin } = await loginAs(app, { phone: '9000000088', role: 'ADMIN' });
    const list = await admin.agent.get(`/api/v1/admin/users/${u.id}/devices`);
    expect(list.status).toBe(200);
    expect(list.body.devices).toHaveLength(2);
    expect(list.body.devices[0].deviceId).toBeUndefined(); // raw device ids are never exposed

    const del = await admin.agent
      .delete(`/api/v1/admin/users/${u.id}/devices/${list.body.devices[0].id}`)
      .set('x-csrf-token', admin.csrf);
    expect(del.status).toBe(200);
    expect((await login(d3)).status).toBe(200);
  });

  it('admin "sign out now" ends the operator\'s login immediately', async () => {
    const u = await createUser({ phone: PHONE, password: PASSWORD });
    const pc = await makeAgent(app);
    const phone = await makeAgent(app);
    await login(pc);
    const { agent: admin } = await loginAs(app, { phone: '9000000088', role: 'ADMIN' });

    expect((await post(admin, `/api/v1/admin/users/${u.id}/sign-out`)).status).toBe(200);
    expect((await me(pc)).body.code).toBe('SESSION_ENDED');
    expect((await login(phone)).status).toBe(200); // other registered-able device may sign in now
  });

  it('two devices signing in at the same instant: exactly one wins', async () => {
    await createUser({ phone: PHONE, password: PASSWORD });
    const a = await makeAgent(app);
    const b = await makeAgent(app);
    const [ra, rb] = await Promise.all([login(a), login(b)]);
    expect([ra.status, rb.status].sort()).toEqual([200, 409]);
  });

  it('admins and staff are not limited', async () => {
    await createUser({ phone: '9000000077', password: PASSWORD, role: 'SUPER_ADMIN' });
    const agents = [await makeAgent(app), await makeAgent(app), await makeAgent(app)];
    for (const a of agents) {
      expect((await post(a, '/api/v1/auth/login', { phone: '9000000077', password: PASSWORD })).status).toBe(200);
    }
    for (const a of agents) expect((await a.agent.get('/api/v1/auth/me')).status).toBe(200);
  });
});
