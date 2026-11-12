// common.schema.ts — reusable Zod primitives for the API boundary.
import { z } from 'zod';
import { MAX_PAGE_SIZE } from '../../config/constants';

// Indian mobile: 10 digits after normalisation (optionally with +91 handled in normalize()).
export const phoneSchema = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s-]/g, ''))
  .refine((v) => /^(?:\+?91)?[6-9]\d{9}$/.test(v), 'Enter a valid 10-digit mobile number');

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email('Enter a valid email address');

// Reject HTML markup / control chars in free-text names.
export const nameSchema = z
  .string()
  .trim()
  .min(1, 'Required')
  .max(120)
  .refine((v) => !/[<>]/.test(v), 'Invalid characters')
  // eslint-disable-next-line no-control-regex
  .refine((v) => !/[\u0000-\u001f\u007f]/.test(v), 'Invalid characters');

export const passwordSchema = z
  .string()
  .min(12, 'Password must be at least 12 characters')
  .max(200);

// Money as positive integer paise.
export const paiseSchema = z.coerce.number().int().positive();

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(20),
});

export const dateRangeSchema = z
  .object({
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
  })
  .refine((v) => !v.from || !v.to || v.from <= v.to, {
    message: 'Start date must be on or before end date',
    path: ['to'],
  });

export const uuidSchema = z.string().uuid();
