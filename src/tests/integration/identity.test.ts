// identity.test.ts — Aadhaar/PAN on operator sign-up and customers: validated, encrypted,
// shown masked only; one Aadhaar per operator account; centre logo.
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import type { Express } from 'express';
import { buildApp } from '../../app';
import { Customer, User } from '../../db/models';
import { resetDb, makeAgent, post, loginAs, createService, testAadhaar } from '../helpers/test-db';

let app: Express;
beforeAll(() => { app = buildApp(); });
beforeEach(async () => { await resetDb(); });

const REG = { fullName: 'Ravi', phone: '9876500001', password: 'operatorpass12345', centreName: 'Ravi CSC' };
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

describe('operator sign-up', () => {
  it('requires a valid Aadhaar and PAN, with clear messages', async () => {
    const a = await makeAgent(app);
    const none = await post(a, '/api/v1/auth/register', { ...REG, aadhaar: '', pan: '' });
    expect(none.status).toBe(400);
    const typo = await post(a, '/api/v1/auth/register', { ...REG, aadhaar: '234567890123', pan: 'ABCPE1234F' });
    const valid = testAadhaar();
    const msgs = JSON.stringify(typo.body.fieldErrors);
    if (valid !== '234567890123') expect(msgs).toContain('not valid');
    const badPan = await post(a, '/api/v1/auth/register', { ...REG, aadhaar: valid, pan: 'ABCQE1234F' });
    expect(JSON.stringify(badPan.body.fieldErrors)).toContain('PAN format');
  });

  it('stores Aadhaar/PAN encrypted, returns them masked only, and blocks a second account with the same Aadhaar', async () => {
    const aadhaar = testAadhaar();
    const a = await makeAgent(app);
    const res = await post(a, '/api/v1/auth/register', { ...REG, aadhaar: aadhaar.replace(/(\d{4})(\d{4})/, '$1 $2 '), pan: 'abcpe1234f' });
    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ aadhaarMasked: `XXXX XXXX ${aadhaar.slice(-4)}`, panMasked: 'ABCXXXX34F' });
    expect(JSON.stringify(res.body)).not.toContain(aadhaar);
    const stored = await User.findById(res.body.user.id).lean();
    expect(stored!.aadhaarEnc).toBeTruthy();
    expect(JSON.stringify(stored)).not.toContain(aadhaar); // never in plain text in the database
    expect(JSON.stringify(stored)).not.toContain('ABCPE1234F');

    const b = await makeAgent(app);
    const dup = await post(b, '/api/v1/auth/register', { ...REG, phone: '9876500002', aadhaar, pan: 'ABCPE1234F' });
    expect(dup.status).toBe(409);
    expect(dup.body.message).toContain('Aadhaar');

    const { agent: admin } = await loginAs(app, { phone: '9000000044', role: 'ADMIN' });
    const list = (await admin.agent.get('/api/v1/admin/users?status=PENDING_APPROVAL')).body.items;
    expect(list[0]).toMatchObject({ aadhaarMasked: `XXXX XXXX ${aadhaar.slice(-4)}`, panMasked: 'ABCXXXX34F' });
    expect(JSON.stringify(list)).not.toContain('aadhaarEnc');
  });

  it('accepts a centre logo with the form; only the owner and staff can see it', async () => {
    const a = await makeAgent(app);
    const res = await a.agent.post('/api/v1/auth/register').set('x-csrf-token', a.csrf)
      .field('fullName', 'Ravi').field('phone', '9876500003').field('password', 'operatorpass12345')
      .field('aadhaar', testAadhaar()).field('pan', 'ABCPE1234F').attach('logo', PNG, { filename: 'logo.png', contentType: 'image/png' });
    expect(res.status).toBe(201);
    const logoUrl = res.body.user.logoUrl as string;
    expect(logoUrl).toMatch(/^\/api\/v1\/users\/.+\/logo\?v=\d+$/);
    const fake = await a.agent.post('/api/v1/auth/register').set('x-csrf-token', a.csrf)
      .field('fullName', 'X').field('phone', '9876500004').field('password', 'operatorpass12345')
      .field('aadhaar', testAadhaar()).field('pan', 'ABCPE1234F').attach('logo', Buffer.from('nope'), { filename: 'l.png', contentType: 'image/png' });
    expect(fake.status).toBe(400);
    expect(await User.exists({ phoneNormalized: '9876500004' })).toBeNull(); // bad logo → no half-created account

    const { agent: admin } = await loginAs(app, { phone: '9000000044', role: 'ADMIN' });
    expect((await admin.agent.get(logoUrl)).headers['content-type']).toBe('image/png');
    const { agent: other } = await loginAs(app, { phone: '9845000077' });
    expect((await other.agent.get(logoUrl)).status).toBe(404);
  });
});

describe('customers', () => {
  it('optional Aadhaar/PAN: validated, encrypted, masked everywhere incl. CSV; can be cleared', async () => {
    const svc = await createService({ code: 'PAN' });
    const { agent: op } = await loginAs(app, { phone: '9845000088' });
    const aadhaar = testAadhaar();
    const bad = await post(op, '/api/v1/customers', { fullName: 'Suresh', mobile: '9811111111', serviceId: svc.id, aadhaar: '1234' });
    expect(bad.status).toBe(400);
    const none = await post(op, '/api/v1/customers', { fullName: 'No ID', mobile: '9811111112', serviceId: svc.id, aadhaar: '', pan: '' });
    expect(none.status).toBe(201);
    const c = (await post(op, '/api/v1/customers', { fullName: 'Suresh', mobile: '9811111111', serviceId: svc.id, aadhaar, pan: 'BNZPM2501F' })).body.customer;
    expect(c).toMatchObject({ aadhaarMasked: `XXXX XXXX ${aadhaar.slice(-4)}`, panMasked: 'BNZXXXX01F' });
    for (const r of [await op.agent.get(`/api/v1/customers/${c.id}`), await op.agent.get('/api/v1/customers'), await op.agent.get('/api/v1/reports/export.csv')]) {
      expect(r.text).not.toContain(aadhaar);
      expect(r.text).not.toContain('BNZPM2501F');
      expect(r.text).not.toContain('aadhaarEnc');
    }
    expect((await op.agent.get('/api/v1/reports/export.csv')).text).toContain(`XXXX XXXX ${aadhaar.slice(-4)}`);
    const stored = await Customer.findById(c.id).lean();
    expect(JSON.stringify(stored)).not.toContain(aadhaar);
    await op.agent.patch(`/api/v1/customers/${c.id}`).set('x-csrf-token', op.csrf).send({ clearAadhaar: true });
    expect((await op.agent.get(`/api/v1/customers/${c.id}`)).body.customer.aadhaarMasked).toBeNull();
  });
});
