// fid.schema.ts — FID card generation input. Aadhaar minimised: last-4 only, optional.
import { z } from 'zod';
import { nameSchema } from './common.schema';

export const fidGenerateSchema = z.object({
  farmerName: nameSchema,
  gender: z.enum(['MALE', 'FEMALE', 'OTHER']),
  fidNumber: z
    .string()
    .trim()
    .min(1)
    .max(40)
    .regex(/^[A-Za-z0-9/-]+$/, 'FID may contain letters, numbers, / and - only'),
  address: z.string().trim().min(1).max(500),
  // Privacy: never collect full Aadhaar here — accept only the last 4 digits, optional.
  maskedAadhaar: z.string().trim().regex(/^\d{4}$/, 'Enter only the last 4 digits').optional(),
  // Optional photo as a data URL (validated by content in the service).
  photoBase64: z.string().max(1_800_000).optional(),
  customerId: z.string().uuid().optional(),
});
export type FidGenerateInput = z.infer<typeof fidGenerateSchema>;
