// application.schema.ts — insurance / membership / training / grievance submissions + status.
import { z } from 'zod';
import { nameSchema, phoneSchema, emailSchema } from './common.schema';
import {
  INSURANCE_STATUSES,
  MEMBERSHIP_STATUSES,
  TRAINING_STATUSES,
  GRIEVANCE_STATUSES,
} from '../constants/application-status';

export const insuranceSubmitSchema = z.object({
  customerName: nameSchema,
  mobile: phoneSchema,
  vehicleNumber: z.string().trim().max(32).optional(),
  nomineeName: z.string().trim().max(120).optional(),
  nomineeRelation: z.string().trim().max(60).optional(),
  policyType: z.string().trim().max(80).optional(),
  notes: z.string().trim().max(2000).optional(),
});

export const membershipSubmitSchema = z.object({
  operatorName: nameSchema,
  centreName: z.string().trim().min(1).max(160),
  district: z.string().trim().min(1).max(120),
  taluk: z.string().trim().min(1).max(120),
  phone: phoneSchema,
  email: emailSchema.optional().or(z.literal('').transform(() => undefined)),
});

export const trainingSubmitSchema = z.object({
  name: nameSchema,
  phone: phoneSchema,
  topic: z.string().trim().min(1).max(160),
  mode: z.enum(['ONLINE', 'OFFLINE']),
  notes: z.string().trim().max(2000).optional(),
});

export const grievanceSubmitSchema = z.object({
  name: nameSchema,
  phone: phoneSchema,
  category: z.string().trim().min(1).max(80),
  details: z.string().trim().min(1).max(4000),
});

export const insuranceStatusSchema = z.object({ status: z.enum(INSURANCE_STATUSES) });
export const membershipStatusSchema = z.object({ status: z.enum(MEMBERSHIP_STATUSES) });
export const trainingStatusSchema = z.object({ status: z.enum(TRAINING_STATUSES) });
export const grievanceStatusSchema = z.object({
  status: z.enum(GRIEVANCE_STATUSES),
  resolutionNote: z.string().trim().max(2000).optional(),
});
