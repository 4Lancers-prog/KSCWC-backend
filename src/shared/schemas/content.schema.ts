// content.schema.ts — announcements, committees, government links, documents.
import { z } from 'zod';
import { COMMITTEE_TYPES } from '../constants/committee';

// ── Announcements / videos ──
export const announcementCreateSchema = z.object({
  title: z.string().trim().min(1).max(240),
  body: z.string().trim().max(5000).optional(),
  contentType: z.enum(['ANNOUNCEMENT', 'VIDEO']).default('ANNOUNCEMENT'),
  videoUrl: z.string().trim().url().optional(), // validated to a safe YouTube embed in the service
  status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']).default('DRAFT'),
  publishAt: z.coerce.date().optional(),
  expiresAt: z.coerce.date().optional(),
  sortOrder: z.coerce.number().int().min(0).default(0),
});
export const announcementUpdateSchema = announcementCreateSchema.partial();

// ── Committee members ──
export const committeeCreateSchema = z.object({
  committeeType: z.enum(COMMITTEE_TYPES),
  name: z.string().trim().min(1).max(160),
  roleTitle: z.string().trim().max(160).optional(),
  district: z.string().trim().max(120).optional(),
  bio: z.string().trim().max(2000).optional(),
  publicPhone: z.string().trim().max(16).optional(),
  sortOrder: z.coerce.number().int().min(0).default(0),
  isActive: z.boolean().default(true),
});
export const committeeUpdateSchema = committeeCreateSchema.partial();
export const committeeReorderSchema = z.object({
  order: z.array(z.object({ id: z.string().uuid(), sortOrder: z.number().int().min(0) })).max(500),
});

// ── Government links ──
// Admins often paste "kaveri.karnataka.gov.in" or "www…" or an http:// address: make it https://.
const portalUrl = z.preprocess(
  (v) => {
    if (typeof v !== 'string') return v;
    let s = v.trim();
    if (!s) return s;
    if (/^http:\/\//i.test(s)) s = 'https://' + s.slice(7);
    else if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) s = 'https://' + s.replace(/^\/+/, '');
    return s;
  },
  z.string().url('Enter a web address, e.g. https://sevasindhu.karnataka.gov.in'),
); // https is also enforced in the service

export const govLinkCreateSchema = z.object({
  title: z.string().trim().min(1, 'Enter a name for the portal').max(200),
  url: portalUrl,
  description: z.string().trim().max(1000).optional(),
  category: z.enum(['STATE', 'CENTRAL', 'OTHER']).optional(), // legacy; use categoryId
  categoryId: z.string().uuid().nullable().optional(),
  featured: z.boolean().default(false),
  sortOrder: z.coerce.number().int().min(0).default(0),
  isActive: z.boolean().default(true),
});
export const govLinkUpdateSchema = govLinkCreateSchema.partial();

// ── Documents (metadata; file comes via multipart) ──
// visibility: PUBLIC = everyone; PRIVATE = logged-in operators/staff only ("members only")
export const documentMetaSchema = z.object({
  title: z.string().trim().min(1, 'Enter a title').max(200),
  description: z.string().trim().max(500).optional(),
  kind: z.enum(['APPLICATION', 'DRAFT']).default('APPLICATION'),
  categoryId: z.string().uuid().optional().or(z.literal('').transform(() => undefined)),
  visibility: z.enum(['PUBLIC', 'PRIVATE']).default('PUBLIC'),
});
export const documentUpdateSchema = z.object({
  title: z.string().trim().min(1, 'Enter a title').max(200).optional(),
  description: z.string().trim().max(500).nullable().optional(),
  kind: z.enum(['APPLICATION', 'DRAFT']).optional(),
  categoryId: z.string().uuid().nullable().optional(),
  visibility: z.enum(['PUBLIC', 'PRIVATE']).optional(),
});
