// auth.schema.ts — registration, login, password reset, MFA schemas.
import { z } from 'zod';
import { aadhaarSchema, panSchema } from '../../lib/identity';
import { emailSchema, nameSchema, passwordSchema, phoneSchema } from './common.schema';

export const registerSchema = z.object({
  fullName: nameSchema,
  phone: phoneSchema,
  email: emailSchema.optional().or(z.literal('').transform(() => undefined)),
  password: passwordSchema,
  centreName: z.string().trim().max(160).optional(),
  cscId: z.string().trim().max(80).optional(),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER']).optional(),
  dob: z.coerce.date().optional(),
  aadhaar: aadhaarSchema,
  pan: panSchema,
  // Postal PIN code (6 digits). Optional at the schema level; the sign-up form requires it.
  pincode: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'Enter a 6-digit PIN code')
    .optional()
    .or(z.literal('').transform(() => undefined)),
  // Shop GPS, captured with the shop photo. Optional so registration still works if the browser
  // blocks location; the sign-up form asks for it alongside the photo.
  shopLat: z.coerce.number().min(-90).max(90).optional(),
  shopLng: z.coerce.number().min(-180).max(180).optional(),
  shopGpsAccuracy: z.coerce.number().nonnegative().max(100_000).optional(),
  // Registration-fee payment, captured on the last step after the user scans the admin's QR.
  // Optional at the schema level so registration still works before an admin has published a QR;
  // the sign-up form requires the UTR when a scanner is configured.
  paymentUtr: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{6,32}$/, 'Enter the payment reference / UTR (6–32 letters or digits)')
    .optional()
    .or(z.literal('').transform(() => undefined)),
  paymentAmountPaise: z.coerce.number().int().positive().max(100_00_000).optional(),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  phone: phoneSchema,
  password: z.string().min(1, 'Password is required'),
  mfaToken: z.string().trim().length(6).optional(),
  // Random per-browser id from the frontend (operator device rules).
  deviceId: z.string().trim().min(8).max(100).optional(),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const forgotPasswordSchema = z.object({
  phone: phoneSchema,
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Enter your current password').max(200),
  newPassword: passwordSchema,
});

export const resetPasswordSchema = z.object({
  token: z.string().min(10),
  password: passwordSchema,
});

export const enableMfaSchema = z.object({
  token: z.string().trim().length(6),
});
