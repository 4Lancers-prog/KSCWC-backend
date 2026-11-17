// customer.schema.ts — customer create/update/status/filter schemas.
import { z } from 'zod';
import { aadhaarSchema, panSchema, optional } from '../../lib/identity';
import { nameSchema, phoneSchema, paiseSchema, paginationSchema } from './common.schema';
import { CUSTOMER_STATUSES } from '../constants/customer-status';

export const customerCreateSchema = z.object({
  fullName: nameSchema,
  mobile: phoneSchema,
  serviceId: z.string().uuid('Choose a service'),
  referenceCode: z.string().trim().max(100).optional(),
  feePaise: paiseSchema.optional(),
  notes: z.string().trim().max(2000).optional(),
  aadhaar: optional(aadhaarSchema),
  pan: optional(panSchema),
  status: z.enum(CUSTOMER_STATUSES).optional(),
  // when true the caller has acknowledged a possible duplicate and wants to proceed
  confirmDuplicate: z.boolean().optional(),
});
export type CustomerCreateInput = z.infer<typeof customerCreateSchema>;

export const customerUpdateSchema = z.object({
  fullName: nameSchema.optional(),
  mobile: phoneSchema.optional(),
  serviceId: z.string().uuid().optional(),
  referenceCode: z.string().trim().max(100).optional().nullable(),
  feePaise: paiseSchema.optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
  aadhaar: optional(aadhaarSchema),
  pan: optional(panSchema),
  // explicitly remove a stored number
  clearAadhaar: z.boolean().optional(),
  clearPan: z.boolean().optional(),
});
export type CustomerUpdateInput = z.infer<typeof customerUpdateSchema>;

export const customerStatusSchema = z.object({
  status: z.enum(CUSTOMER_STATUSES),
  reason: z.string().trim().max(500).optional(),
});

export const customerFilterSchema = paginationSchema.extend({
  status: z.enum(CUSTOMER_STATUSES).optional(),
  serviceId: z.string().uuid().optional(),
  search: z.string().trim().max(120).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  ownerUserId: z.string().uuid().optional(), // admin-only filter
});
export type CustomerFilter = z.infer<typeof customerFilterSchema>;
