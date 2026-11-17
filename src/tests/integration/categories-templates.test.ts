// categories-templates.test.ts — categories/sub-categories for links + templates; Word/PDF templates.
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import type { Express } from 'express';
import { buildApp } from '../../app';
import { DocumentModel, GovernmentLink } from '../../db/models';
import { ensureDefaultCategories } from '../../modules/categories/categories.service';
import { resetDb, makeAgent, post, loginAs, type Agent } from '../helpers/test-db';

let app: Express;
beforeAll(() => { app = buildApp(); });
beforeEach(async () => { await resetDb(); });

const PDF = Buffer.from('%PDF-1.4\n%test\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF');
const DOCX = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(200)]);
const DOC = Buffer.concat([Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), Buffer.alloc(200)]);
const upload = (a: Agent, file: Buffer, filename: string, contentType: string, fields: Record<string, string>) => {
  let r = a.agent.post('/api/v1/admin/documents').set('x-csrf-token', a.csrf).attach('file', file, { filename, contentType });
  for (const [k, v] of Object.entries(fields)) r = r.field(k, v);
  return r;
};

describe('categories', () => {
  it('admin builds category → sub-category (2 levels only); in-use categories cannot be deleted', async () => {
    const { agent: admin } = await loginAs(app, { phone: '9000000044', role: 'ADMIN' });
    const top = (await post(admin, '/api/v1/admin/categories', { scope: 'LINKS', nameKn: 'ಕರ್ನಾಟಕ', nameEn: 'Karnataka' })).body.category;
    const sub = (await post(admin, '/api/v1/admin/categories', { scope: 'LINKS', nameKn: 'ಕಂದಾಯ', nameEn: 'Revenue', parentId: top.id })).body.category;
    expect(sub.parentId).toBe(top.id);
    const third = await post(admin, '/api/v1/admin/categories', { scope: 'LINKS', nameKn: 'X', parentId: sub.id });
    expect(third.status).toBe(400);

    const link = (await post(admin, '/api/v1/admin/government-links', { title: 'Bhoomi', url: 'landrecords.karnataka.gov.in', categoryId: sub.id })).body.link;
    expect(link.categoryId).toBe(sub.id);
    const del = await admin.agent.delete(`/api/v1/admin/categories/${sub.id}`).set('x-csrf-token', admin.csrf);
    expect(del.status).toBe(409);
    expect(del.body.message).toContain('1 link');
    expect((await admin.agent.delete(`/api/v1/admin/categories/${top.id}`).set('x-csrf-token', admin.csrf)).status).toBe(409); // has a sub

    // a templates category can't be used for a link
    const docCat = (await post(admin, '/api/v1/admin/categories', { scope: 'DOCUMENTS', nameKn: 'ಅರ್ಜಿಗಳು' })).body.category;
    expect((await post(admin, '/api/v1/admin/government-links', { title: 'Y', url: 'pmkisan.gov.in', categoryId: docCat.id })).status).toBe(400);

    const visitor = await makeAgent(app);
    const pub = await visitor.agent.get('/api/v1/public/categories?scope=LINKS');
    expect(pub.body.items.map((c: { nameEn: string }) => c.nameEn).sort()).toEqual(['Karnataka', 'Revenue']);
  });

  it('operators cannot change categories', async () => {
    const { agent: op } = await loginAs(app, { phone: '9845000033' });
    expect((await post(op, '/api/v1/admin/categories', { scope: 'LINKS', nameKn: 'X' })).status).toBe(403);
  });

  it('existing data moves into categories once (Karnataka/India/Other; old document labels)', async () => {
    await GovernmentLink.create([
      { title: 'A', url: 'https://a.gov.in', category: 'STATE' },
      { title: 'B', url: 'https://b.gov.in', category: 'CENTRAL' },
      { title: 'C', url: 'https://c.gov.in' },
    ]);
    await DocumentModel.create({ title: 'Form', category: 'ಅರ್ಜಿ · Forms', fileKey: 'k', originalFilename: 'f.pdf', mimeType: 'application/pdf', sizeBytes: 10 });
    await ensureDefaultCategories();
    await ensureDefaultCategories(); // twice: no duplicates
    const visitor = await makeAgent(app);
    const cats = (await visitor.agent.get('/api/v1/public/categories?scope=LINKS')).body.items as { id: string; nameEn: string }[];
    expect(cats.map((c) => c.nameEn)).toEqual(['Government of Karnataka', 'Government of India', 'Other']);
    const byTitle = Object.fromEntries((await GovernmentLink.find().lean()).map((l) => [l.title, l.categoryId]));
    expect(byTitle.A).toBe(cats[0]!.id);
    expect(byTitle.B).toBe(cats[1]!.id);
    expect(byTitle.C).toBe(cats[2]!.id);
    const docCats = (await visitor.agent.get('/api/v1/public/categories?scope=DOCUMENTS')).body.items;
    expect(docCats).toHaveLength(1);
    expect(docCats[0]).toMatchObject({ nameKn: 'ಅರ್ಜಿ', nameEn: 'Forms' });
  });
});

describe('templates (PDF / Word)', () => {
  it('accepts PDF, DOCX and old DOC (even when the browser sends a generic type); refuses fakes', async () => {
    const { agent: admin } = await loginAs(app, { phone: '9000000044', role: 'ADMIN' });
    expect((await upload(admin, PDF, 'form.pdf', 'application/pdf', { title: 'PDF form' })).status).toBe(201);
    expect((await upload(admin, DOCX, 'form.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', { title: 'Word form' })).status).toBe(201);
    expect((await upload(admin, DOC, 'old.doc', 'application/octet-stream', { title: 'Old Word form' })).status).toBe(201);
    const fake = await upload(admin, Buffer.from('hello'), 'fake.pdf', 'application/pdf', { title: 'Fake' });
    expect(fake.status).toBe(400);
    expect(fake.body.message).toContain('not a real PDF');
    const exe = await upload(admin, Buffer.from('MZ...'), 'virus.exe', 'application/octet-stream', { title: 'Nope' });
    expect(exe.status).toBe(400);
  });

  it('members-only templates: hidden from visitors, listed + downloadable for operators, with the right file name', async () => {
    const { agent: admin } = await loginAs(app, { phone: '9000000044', role: 'ADMIN' });
    const cat = (await post(admin, '/api/v1/admin/categories', { scope: 'DOCUMENTS', nameKn: 'ಅಫಿಡವಿಟ್', nameEn: 'Affidavits' })).body.category;
    const pub = (await upload(admin, PDF, 'a.pdf', 'application/pdf', { title: 'Public form', categoryId: cat.id })).body.document;
    const priv = (await upload(admin, DOCX, 'b.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      { title: 'ಅಫಿಡವಿಟ್ ನಮೂನೆ', categoryId: cat.id, visibility: 'PRIVATE', description: 'Editable affidavit' })).body.document;

    const visitor = await makeAgent(app);
    const vlist = (await visitor.agent.get('/api/v1/public/documents')).body.items as { id: string }[];
    expect(vlist.map((d) => d.id)).toEqual([pub.id]);
    expect((await visitor.agent.get(`/api/v1/public/documents/${priv.id}/download`)).status).toBe(404);

    const { agent: op } = await loginAs(app, { phone: '9845000033' });
    const olist = (await op.agent.get('/api/v1/public/documents')).body.items as { id: string; fileExt: string; categoryId: string; description: string }[];
    expect(olist).toHaveLength(2);
    expect(olist.find((d) => d.id === priv.id)).toMatchObject({ fileExt: 'docx', categoryId: cat.id, description: 'Editable affidavit' });
    const dl = await op.agent.get(`/api/v1/public/documents/${priv.id}/download`);
    expect(dl.status).toBe(200);
    expect(dl.headers['content-disposition']).toContain(`filename*=UTF-8''${encodeURIComponent('ಅಫಿಡವಿಟ್ ನಮೂನೆ.docx')}`);

    // admin moves it to "everyone"
    await admin.agent.patch(`/api/v1/admin/documents/${priv.id}`).set('x-csrf-token', admin.csrf).send({ visibility: 'PUBLIC' });
    expect((await visitor.agent.get('/api/v1/public/documents')).body.items).toHaveLength(2);
  });

  it('application forms and drafts are separate sections, each with its own categories; display images', async () => {
    const { agent: admin } = await loginAs(app, { phone: '9000000044', role: 'ADMIN' });
    const appCat = (await post(admin, '/api/v1/admin/categories', { scope: 'DOCUMENTS', nameKn: 'ಆದಾಯ', nameEn: 'Income' })).body.category;
    const draftCat = (await post(admin, '/api/v1/admin/categories', { scope: 'DRAFTS', nameKn: 'ಅಫಿಡವಿಟ್', nameEn: 'Affidavits' })).body.category;
    const draftSub = (await post(admin, '/api/v1/admin/categories', { scope: 'DRAFTS', nameKn: 'ಹೆಸರು ಬದಲಾವಣೆ', nameEn: 'Name change', parentId: draftCat.id })).body.category;

    // a draft can't go into an application-form category (and vice versa)
    const wrong = await upload(admin, DOCX, 'd.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', { title: 'X', kind: 'DRAFT', categoryId: appCat.id });
    expect(wrong.status).toBe(400);
    const draft = (await upload(admin, DOCX, 'd.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      { title: 'Name change affidavit', kind: 'DRAFT', categoryId: draftSub.id, visibility: 'PUBLIC' })).body.document;
    expect(draft).toMatchObject({ kind: 'DRAFT', categoryId: draftSub.id, imageUrl: null });
    expect(JSON.stringify(draft)).not.toContain('fileKey');
    const form = (await upload(admin, PDF, 'f.pdf', 'application/pdf', { title: 'Income form', kind: 'APPLICATION', categoryId: appCat.id, visibility: 'PUBLIC' })).body.document;
    expect(form.kind).toBe('APPLICATION');

    // display image
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
    const img = await admin.agent.post(`/api/v1/admin/documents/${draft.id}/image`).set('x-csrf-token', admin.csrf).attach('image', png, { filename: 'cover.png', contentType: 'image/png' });
    expect(img.status).toBe(200);
    expect(img.body.document.imageUrl).toMatch(/\/api\/v1\/public\/documents\/.+\/image\?v=\d+$/);
    const visitor = await makeAgent(app);
    const list = (await visitor.agent.get('/api/v1/public/documents')).body.items as { id: string; kind: string; imageUrl: string | null }[];
    expect(list.find((d) => d.id === draft.id)).toMatchObject({ kind: 'DRAFT' });
    expect((await visitor.agent.get(img.body.document.imageUrl)).headers['content-type']).toBe('image/png');
    const fake = await admin.agent.post(`/api/v1/admin/documents/${form.id}/image`).set('x-csrf-token', admin.csrf).attach('image', Buffer.from('nope'), { filename: 'x.png', contentType: 'image/png' });
    expect(fake.status).toBe(400);

    // categories in use can't be deleted, per section
    const del = await admin.agent.delete(`/api/v1/admin/categories/${draftSub.id}`).set('x-csrf-token', admin.csrf);
    expect(del.status).toBe(409);
    expect(del.body.message).toContain('draft');

    // moving a document to the other section clears its (now wrong) category
    await admin.agent.patch(`/api/v1/admin/documents/${form.id}`).set('x-csrf-token', admin.csrf).send({ kind: 'DRAFT' });
    const moved = ((await admin.agent.get('/api/v1/admin/documents')).body.items as { id: string; kind: string; categoryId: string | null }[]).find((d) => d.id === form.id);
    expect(moved).toMatchObject({ kind: 'DRAFT', categoryId: null });
  });
});
