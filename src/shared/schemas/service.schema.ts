// service.schema.ts — service catalogue create/update (admin).
import { z } from 'zod';
import { paiseSchema } from './common.schema';

export const serviceCreateSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2)
    .max(80)
    .regex(/^[A-Z0-9_]+$/, 'Use UPPER_SNAKE_CASE (A–Z, 0–9, _)'),
  nameKn: z.string().trim().min(1).max(200),
  nameEn: z.string().trim().max(200).optional(),
  description: z.string().trim().max(2000).optional(),
  defaultFeePaise: paiseSchema.optional(),
  sortOrder: z.coerce.number().int().min(0).default(0),
  isActive: z.boolean().default(true),
});
export type ServiceCreateInput = z.infer<typeof serviceCreateSchema>;

export const serviceUpdateSchema = serviceCreateSchema.partial().omit({ code: true });
export type ServiceUpdateInput = z.infer<typeof serviceUpdateSchema>;
