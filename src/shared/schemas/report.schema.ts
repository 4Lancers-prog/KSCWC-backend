// report.schema.ts — report + CSV export filters.
import { z } from 'zod';
import { CUSTOMER_STATUSES } from '../constants/customer-status';

export const reportFilterSchema = z
  .object({
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    serviceId: z.string().uuid().optional(),
    status: z.enum(CUSTOMER_STATUSES).optional(),
    ownerUserId: z.string().uuid().optional(), // admin only
  })
  .refine((v) => !v.from || !v.to || v.from <= v.to, {
    message: 'Start date must be on or before end date',
    path: ['to'],
  });
export type ReportFilter = z.infer<typeof reportFilterSchema>;
