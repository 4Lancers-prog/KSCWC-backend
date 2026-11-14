// applications.access.test.ts — all 4 application forms: logged-in operators only.
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

const FORMS: Record<string, object> = {
  insurance: { customerName: 'Lakshmi', mobile: '9123456780', policyType: 'Two wheeler' },
  membership: { operatorName: 'Ravi', centreName: 'Ravi CSC', district: 'Mysuru', taluk: 'Hunsur', phone: '9876543210' },
  training: { name: 'Ravi', phone: '9876543210', topic: 'FID', mode: 'ONLINE' },
  grievance: { name: 'Ravi', phone: '9876543210', category: 'Wallet', details: 'Top-up not credited' },
};

describe('application forms are for logged-in operators only', () => {
  it('visitors who are not logged in are refused (LOGIN_REQUIRED) — nothing is saved', async () => {
    const visitor = await makeAgent(app);
    for (const [kind, body] of Object.entries(FORMS)) {
      const res = await post(visitor, `/api/v1/applications/${kind}`, body);
      expect(res.status, kind).toBe(401);
      expect(res.body.code, kind).toBe('LOGIN_REQUIRED');
    }
    const { agent: admin } = await loginAs(app, { phone: '9000000066', role: 'ADMIN' });
    for (const kind of ['insurance', 'membership', 'training', 'grievances']) {
      expect((await admin.agent.get(`/api/v1/admin/applications/${kind}`)).body.total, kind).toBe(0);
    }
  });

  it('staff accounts are refused (OPERATORS_ONLY)', async () => {
    const { agent: admin } = await loginAs(app, { phone: '9000000066', role: 'ADMIN' });
    const res = await post(admin, '/api/v1/applications/grievance', FORMS.grievance!);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('OPERATORS_ONLY');
  });

  it('operators can submit all 4, and every one is linked to their account', async () => {
    const { agent: op } = await loginAs(app, { phone: '9845000077' }); // different from the form phones
    for (const [kind, body] of Object.entries(FORMS)) {
      expect((await post(op, `/api/v1/applications/${kind}`, body)).status, kind).toBe(201);
    }
    const mine = await op.agent.get('/api/v1/me/applications');
    expect(mine.body.insurance).toHaveLength(1);
    expect(mine.body.membership).toHaveLength(1); // previously matched only by phone → would be 0
    expect(mine.body.training).toHaveLength(1);
    expect(mine.body.grievances).toHaveLength(1);
  });
});
