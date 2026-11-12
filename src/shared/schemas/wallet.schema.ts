// wallet.schema.ts — top-up, checkout verification, admin adjustment, ledger filter.
import { z } from 'zod';
import { paiseSchema, paginationSchema } from './common.schema';
import { WALLET_TX_TYPES } from '../constants/wallet';

export const topupCreateSchema = z.object({
  amountPaise: paiseSchema, // validated against min/max in the service
});
export type TopupCreateInput = z.infer<typeof topupCreateSchema>;

export const checkoutVerifySchema = z.object({
  razorpayOrderId: z.string().min(3),
  razorpayPaymentId: z.string().min(3),
  razorpaySignature: z.string().min(3),
});
export type CheckoutVerifyInput = z.infer<typeof checkoutVerifySchema>;

export const adminAdjustSchema = z.object({
  amountPaise: paiseSchema,
  direction: z.enum(['CREDIT', 'DEBIT']),
  reason: z.string().trim().min(3).max(500),
});
export type AdminAdjustInput = z.infer<typeof adminAdjustSchema>;

export const ledgerFilterSchema = paginationSchema.extend({
  type: z.enum(WALLET_TX_TYPES).optional(),
});
