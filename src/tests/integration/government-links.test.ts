// government-links.test.ts — portal links keep their address; defaults load once.
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import type { Express } from 'express';
import { buildApp } from '../../app';
import { GovernmentLink } from '../../db/models';
import { ensureDefaultGovLinks, DEFAULT_GOV_LINKS } from '../../modules/government-links/default-links';
import { resetDb, makeAgent, post, loginAs } from '../helpers/test-db';

let app: Express;
beforeAll(() => {
  app = buildApp();
});
beforeEach(async () => {
  await resetDb();
});

describe('government portal links', () => {
  it('a link added by the admin keeps its address and shows publicly (regression: url was dropped)', async () => {
    const { agent: admin } = await loginAs(app, { phone: '9000000055', role: 'ADMIN' });
    const res = await post(admin, '/api/v1/admin/government-links', {
      title: 'ಸೇವಾ ಸಿಂಧು · Seva Sindhu', url: 'https://sevasindhu.karnataka.gov.in', category: 'STATE', featured: true,
    });
    expect(res.status).toBe(201);
    // logged in → gets the address
    const { agent: op } = await loginAs(app, { phone: '9845000011' });
    const mine = await op.agent.get('/api/v1/public/government-links');
    expect(mine.body.items).toHaveLength(1);
    expect(mine.body.items[0]).toMatchObject({ url: 'https://sevasindhu.karnataka.gov.in', category: 'STATE', featured: true });
    // visitor → sees the portal, but no address (must log in to open)
    const visitor = await makeAgent(app);
    const pub = await visitor.agent.get('/api/v1/public/government-links');
    expect(pub.body.items).toHaveLength(1);
    expect(pub.body.items[0]).toMatchObject({ title: 'ಸೇವಾ ಸಿಂಧು · Seva Sindhu', url: null, locked: true });
    expect(JSON.stringify(pub.body)).not.toContain('sevasindhu.karnataka.gov.in');
    expect(pub.headers['cache-control']).toContain('no-store');
  });

  it('refuses non-https addresses', async () => {
    const { agent: admin } = await loginAs(app, { phone: '9000000055', role: 'ADMIN' });
    const res = await post(admin, '/api/v1/admin/government-links', { title: 'Fake', url: 'http://example.com' });
    expect(res.status).toBe(400);
  });

  it('defaults load once when no working links exist, and old address-less rows stay hidden', async () => {
    await GovernmentLink.collection.insertOne({ _id: 'old-row' as never, title: 'old, no url', isActive: true, sortOrder: 0 });
    expect(await ensureDefaultGovLinks()).toBe(DEFAULT_GOV_LINKS.length);
    expect(await ensureDefaultGovLinks()).toBe(0); // second start: nothing added
    const { agent: op } = await loginAs(app, { phone: '9845000012' });
    const items = (await op.agent.get('/api/v1/public/government-links')).body.items as { url: string; featured: boolean }[];
    expect(items).toHaveLength(DEFAULT_GOV_LINKS.length);
    expect(items.every((l) => l.url.startsWith('https://'))).toBe(true);
    expect(items[0]!.featured).toBe(true); // featured portals come first
  });

  it('admin can add, show and remove a portal logo; fake images are refused; visitors can see it', async () => {
    const { agent: admin } = await loginAs(app, { phone: '9000000055', role: 'ADMIN' });
    const link = (await post(admin, '/api/v1/admin/government-links', { title: 'Seva Sindhu', url: 'https://sevasindhu.karnataka.gov.in' })).body.link;
    // a real 1x1 PNG
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
    const fake = await admin.agent.post(`/api/v1/admin/government-links/${link.id}/image`).set('x-csrf-token', admin.csrf)
      .attach('image', Buffer.from('not really an image'), { filename: 'x.png', contentType: 'image/png' });
    expect(fake.status).toBe(400);
    const up = await admin.agent.post(`/api/v1/admin/government-links/${link.id}/image`).set('x-csrf-token', admin.csrf)
      .attach('image', png, { filename: 'logo.png', contentType: 'image/png' });
    expect(up.status).toBe(200);
    expect(up.body.link.imageUrl).toMatch(/^\/api\/v1\/public\/government-links\/.+\/image\?v=\d+$/);
    expect(JSON.stringify(up.body)).not.toContain('govlinks/'); // storage key never exposed

    const visitor = await makeAgent(app);
    const list = (await visitor.agent.get('/api/v1/public/government-links')).body.items;
    expect(list[0].imageUrl).toBe(up.body.link.imageUrl);
    expect(list[0].url).toBeNull(); // still locked for visitors
    const img = await visitor.agent.get(up.body.link.imageUrl);
    expect(img.status).toBe(200);
    expect(img.headers['content-type']).toBe('image/png');

    const rm = await admin.agent.delete(`/api/v1/admin/government-links/${link.id}/image`).set('x-csrf-token', admin.csrf);
    expect(rm.body.link.imageUrl).toBeNull();
    expect((await visitor.agent.get(up.body.link.imageUrl)).status).toBe(404);
  });
});
