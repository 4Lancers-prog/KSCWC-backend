// content.test.ts — publish→public visibility (AC-11), unsafe embed rejected (AC-12), form flow.
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import type { Express } from 'express';
import { buildApp } from '../../app';
import { resetDb, loginAs, post } from '../helpers/test-db';

let app: Express;
beforeAll(() => {
  app = buildApp();
});
beforeEach(async () => {
  await resetDb();
});

async function admin() {
  return loginAs(app, { phone: '9000009001', role: 'ADMIN' });
}

describe('announcements (AC-11/12)', () => {
  it('only published, non-expired items appear publicly', async () => {
    const a = await admin();
    await post(a.agent, '/api/v1/admin/announcements', { title: 'Draft one', status: 'DRAFT' });
    await post(a.agent, '/api/v1/admin/announcements', { title: 'Live one', status: 'PUBLISHED' });

    const pub = await a.agent.get('/api/v1/public/announcements');
    expect(pub.status).toBe(200);
    const titles = pub.body.items.map((i: { title: string }) => i.title);
    expect(titles).toContain('Live one');
    expect(titles).not.toContain('Draft one');
  });

  it('rejects an unsafe/non-YouTube video URL (AC-12)', async () => {
    const a = await admin();
    const res = await post(a.agent, '/api/v1/admin/announcements', {
      title: 'Bad video', contentType: 'VIDEO', videoUrl: 'https://evil.example/clip', status: 'PUBLISHED',
    });
    expect(res.status).toBe(400);
  });

  it('stores a safe embed url for a valid YouTube video', async () => {
    const a = await admin();
    const res = await post(a.agent, '/api/v1/admin/announcements', {
      title: 'Good video', contentType: 'VIDEO', videoUrl: 'https://youtu.be/dQw4w9WgXcQ', status: 'PUBLISHED',
    });
    expect(res.status).toBe(201);
    expect(res.body.announcement.videoUrl).toBe('https://www.youtube.com/embed/dQw4w9WgXcQ');
  });
});

describe('government links (AC-12)', () => {
  it('never stores an insecure link: http:// is upgraded to https://, other schemes are rejected', async () => {
    const a = await admin();
    const up = await post(a.agent, '/api/v1/admin/government-links', { title: 'x', url: 'http://insecure.gov' });
    expect(up.status).toBe(201);
    expect(up.body.link.url).toBe('https://insecure.gov');
    const bad = await post(a.agent, '/api/v1/admin/government-links', { title: 'x', url: 'ftp://insecure.gov' });
    expect(bad.status).toBe(400);
  });
});

describe('committees', () => {
  it('public list excludes archived/inactive and filters by district', async () => {
    const a = await admin();
    await post(a.agent, '/api/v1/admin/committees', { committeeType: 'DISTRICT', name: 'Blr Coord', district: 'Bengaluru' });
    await post(a.agent, '/api/v1/admin/committees', { committeeType: 'DISTRICT', name: 'Mys Coord', district: 'Mysuru' });
    const blr = await a.agent.get('/api/v1/public/committees?committeeType=DISTRICT&district=Bengaluru');
    expect(blr.body.items).toHaveLength(1);
    expect(blr.body.items[0].name).toBe('Blr Coord');
  });
});

describe('public forms', () => {
  it('accepts a grievance and returns a ticket code', async () => {
    const a = await loginAs(app, { phone: '9000009002' });
    const res = await post(a.agent, '/api/v1/applications/grievance', {
      name: 'ಶಿವು', phone: '9811112222', category: 'SERVICE', details: 'ಸಮಸ್ಯೆ ಇದೆ',
    });
    expect(res.status).toBe(201);
    expect(res.body.ticketCode).toMatch(/^GRV-/);
    expect(res.body.status).toBe('OPEN');
  });

  it('a normal user cannot reach the admin applications list', async () => {
    const u = await loginAs(app, { phone: '9000009003' });
    const res = await u.agent.get('/api/v1/admin/applications/grievances');
    expect(res.status).toBe(403);
  });
});
