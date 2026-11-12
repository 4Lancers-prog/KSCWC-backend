// manual-topup.schema.ts — manual UPI/QR top-up (user submit, admin review) + QR config.
import { z } from 'zod';
import { paiseSchema, paginationSchema } from './common.schema';

const statusEnum = z.enum(['PENDING', 'APPROVED', 'REJECTED']);

export const manualTopupCreateSchema = z.object({
  amountPaise: paiseSchema, // bounds checked against env min/max in the service
  utrNumber: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{10,24}$/, 'Enter a valid UPI reference / UTR (10–24 letters or digits)'),
  note: z.string().trim().max(240).optional(),
});
export type ManualTopupCreateInput = z.infer<typeof manualTopupCreateSchema>;

export const manualTopupListSchema = paginationSchema.extend({ status: statusEnum.optional() });

export const manualTopupApproveSchema = z.object({
  // optional correction to the amount actually received (per the bank), else the user's amount
  amountPaise: paiseSchema.optional(),
  note: z.string().trim().max(240).optional(),
});
export type ManualTopupApproveInput = z.infer<typeof manualTopupApproveSchema>;

export const manualTopupRejectSchema = z.object({
  reason: z.string().trim().min(3).max(240),
});
export type ManualTopupRejectInput = z.infer<typeof manualTopupRejectSchema>;

export const paymentQrConfigSchema = z.object({
  upiId: z.string().trim().min(3).max(100),
  payeeName: z.string().trim().min(2).max(120),
  note: z.string().trim().max(240).optional(),
});
export type PaymentQrConfigInput = z.infer<typeof paymentQrConfigSchema>;
