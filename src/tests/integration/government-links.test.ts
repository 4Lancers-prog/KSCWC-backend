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
    const visitor = await makeAgent(app);
    const pub = await visitor.agent.get('/api/v1/public/government-links');
    expect(pub.body.items).toHaveLength(1);
    expect(pub.body.items[0]).toMatchObject({ url: 'https://sevasindhu.karnataka.gov.in', category: 'STATE', featured: true });
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
    const visitor = await makeAgent(app);
    const items = (await visitor.agent.get('/api/v1/public/government-links')).body.items as { url: string; featured: boolean }[];
    expect(items).toHaveLength(DEFAULT_GOV_LINKS.length);
    expect(items.every((l) => l.url.startsWith('https://'))).toBe(true);
    expect(items[0]!.featured).toBe(true); // featured portals come first
  });
});
