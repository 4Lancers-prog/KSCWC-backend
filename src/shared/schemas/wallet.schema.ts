// wallet.schema.ts — admin adjustment, ledger filter. (Top-ups are manual UPI: see manual-topup.)
import { z } from 'zod';
import { paiseSchema, paginationSchema } from './common.schema';
import { WALLET_TX_TYPES } from '../constants/wallet';

export const adminAdjustSchema = z.object({
  amountPaise: paiseSchema,
  direction: z.enum(['CREDIT', 'DEBIT']),
  reason: z.string().trim().min(3).max(500),
});
export type AdminAdjustInput = z.infer<typeof adminAdjustSchema>;

export const ledgerFilterSchema = paginationSchema.extend({
  type: z.enum(WALLET_TX_TYPES).optional(),
});
