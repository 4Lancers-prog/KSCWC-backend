// customers.ownership.test.ts — IDOR/horizontal access, duplicate warning, status flow, report (AC-03/04/05).
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import type { Express } from 'express';
import { buildApp } from '../../app';
import { resetDb, loginAs, post, createService } from '../helpers/test-db';

let app: Express;
beforeAll(() => {
  app = buildApp();
});
beforeEach(async () => {
  await resetDb();
});

async function setup() {
  const svc = await createService({ code: 'PAN_CARD' });
  const a = await loginAs(app, { phone: '9000000011' });
  const b = await loginAs(app, { phone: '9000000022' });
  return { svc, a, b };
}

describe('customer creation + duplicate warning', () => {
  it('creates a customer and records initial status history', async () => {
    const { svc, a } = await setup();
    const res = await post(a.agent, '/api/v1/customers', {
      fullName: 'ಸೀತಾ', mobile: '9811111111', serviceId: svc.id,
    });
    expect(res.status).toBe(201);
    expect(res.body.customer.status).toBe('PENDING');

    const detail = await a.agent.get(`/api/v1/customers/${res.body.customer.id}`);
    expect(detail.status).toBe(200);
    expect(detail.body.history).toHaveLength(1);
    expect(detail.body.history[0].newStatus).toBe('PENDING');
  });

  it('warns on a likely duplicate but allows confirmation', async () => {
    const { svc, a } = await setup();
    const base = { fullName: 'ಸೀತಾ', mobile: '9811111111', serviceId: svc.id };
    await post(a.agent, '/api/v1/customers', base);

    const dup = await post(a.agent, '/api/v1/customers', base);
    expect(dup.status).toBe(409);
    expect(dup.body.code).toBe('DUPLICATE_WARNING');

    const confirmed = await post(a.agent, '/api/v1/customers', { ...base, confirmDuplicate: true });
    expect(confirmed.status).toBe(201);
  });
});

describe('ownership / IDOR (AC-03)', () => {
  it("user B cannot read, edit, or change status of user A's customer", async () => {
    const { svc, a, b } = await setup();
    const created = await post(a.agent, '/api/v1/customers', {
      fullName: 'ರಾಮ', mobile: '9822222222', serviceId: svc.id,
    });
    const id = created.body.customer.id as string;

    const read = await b.agent.get(`/api/v1/customers/${id}`);
    expect(read.status).toBe(404); // existence not revealed

    const patch = await b.agent.patch(`/api/v1/customers/${id}`).set('x-csrf-token', b.csrf).send({ fullName: 'HACKED' });
    expect(patch.status).toBe(404);

    const status = await post(b.agent, `/api/v1/customers/${id}/status`, { status: 'COMPLETED' });
    expect(status.status).toBe(404);

    // owner A still sees the original name
    const ownerRead = await a.agent.get(`/api/v1/customers/${id}`);
    expect(ownerRead.body.customer.fullName).toBe('ರಾಮ');
  });

  it("a user's list only contains their own customers", async () => {
    const { svc, a, b } = await setup();
    await post(a.agent, '/api/v1/customers', { fullName: 'A1', mobile: '9833333333', serviceId: svc.id });
    await post(b.agent, '/api/v1/customers', { fullName: 'B1', mobile: '9844444444', serviceId: svc.id });

    const listA = await a.agent.get('/api/v1/customers');
    expect(listA.body.total).toBe(1);
    expect(listA.body.items[0].fullName).toBe('A1');
  });
});

describe('status transitions', () => {
  it('rejects an illegal transition and allows a legal one', async () => {
    const { svc, a } = await setup();
    const c = await post(a.agent, '/api/v1/customers', { fullName: 'X', mobile: '9855555555', serviceId: svc.id });
    const id = c.body.customer.id;

    const ok = await post(a.agent, `/api/v1/customers/${id}/status`, { status: 'IN_PROGRESS' });
    expect(ok.status).toBe(200);
    expect(ok.body.customer.status).toBe('IN_PROGRESS');

    const done = await post(a.agent, `/api/v1/customers/${id}/status`, { status: 'COMPLETED' });
    expect(done.status).toBe(200);

    const illegal = await post(a.agent, `/api/v1/customers/${id}/status`, { status: 'PENDING' });
    expect(illegal.status).toBe(400);
  });
});

describe('report totals (AC-05)', () => {
  it('totals match the records the user owns', async () => {
    const { svc, a } = await setup();
    await post(a.agent, '/api/v1/customers', { fullName: 'R1', mobile: '9866666661', serviceId: svc.id, feePaise: 5000 });
    await post(a.agent, '/api/v1/customers', { fullName: 'R2', mobile: '9866666662', serviceId: svc.id, feePaise: 2500 });

    const report = await a.agent.get('/api/v1/reports/my-customers');
    expect(report.status).toBe(200);
    expect(report.body.totals.total).toBe(2);
    expect(report.body.totals.feeTotalPaise).toBe(7500);
    expect(report.body.byStatus.find((s: { status: string }) => s.status === 'PENDING').count).toBe(2);

    const csv = await a.agent.get('/api/v1/reports/export.csv');
    expect(csv.status).toBe(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.text).toContain('Customer,Mobile,Service');
  });
});
