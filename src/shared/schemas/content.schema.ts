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
export const govLinkCreateSchema = z.object({
  title: z.string().trim().min(1).max(200),
  url: z.string().trim().url(), // https validated in the service
  description: z.string().trim().max(1000).optional(),
  category: z.enum(['STATE', 'CENTRAL', 'OTHER']).default('OTHER'),
  featured: z.boolean().default(false),
  sortOrder: z.coerce.number().int().min(0).default(0),
  isActive: z.boolean().default(true),
});
export const govLinkUpdateSchema = govLinkCreateSchema.partial();

// ── Documents (metadata; file comes via multipart) ──
export const documentMetaSchema = z.object({
  title: z.string().trim().min(1).max(200),
  category: z.string().trim().max(120).optional(),
  visibility: z.enum(['PUBLIC', 'PRIVATE']).default('PUBLIC'),
});
