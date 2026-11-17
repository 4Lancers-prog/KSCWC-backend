// identity.ts — Aadhaar & PAN: validation, encryption at rest, masking for display.
//
// Aadhaar Act / UIDAI rules: full Aadhaar numbers must be stored encrypted and shown masked
// (XXXX XXXX 1234). We store: AES-256-GCM ciphertext + last 4 digits (for display) + an HMAC
// fingerprint (to spot the same number twice without decrypting). The API never returns full
// numbers. PAN is treated the same way (not legally required, but sensitive).
import crypto from 'node:crypto';
import { z } from 'zod';
import { env } from '../config/env';

// ── Validation ──
// Verhoeff checksum (used by UIDAI) — detects any single wrong digit and most swapped digits.
const D = [[0,1,2,3,4,5,6,7,8,9],[1,2,3,4,0,6,7,8,9,5],[2,3,4,0,1,7,8,9,5,6],[3,4,0,1,2,8,9,5,6,7],[4,0,1,2,3,9,5,6,7,8],[5,9,8,7,6,0,4,3,2,1],[6,5,9,8,7,1,0,4,3,2],[7,6,5,9,8,2,1,0,4,3],[8,7,6,5,9,3,2,1,0,4],[9,8,7,6,5,4,3,2,1,0]];
const P = [[0,1,2,3,4,5,6,7,8,9],[1,5,7,6,2,8,3,0,9,4],[5,8,0,3,7,9,6,1,4,2],[8,9,1,6,0,4,3,5,2,7],[9,4,5,3,1,2,6,8,7,0],[4,2,8,6,5,7,3,9,0,1],[2,7,9,3,8,0,6,4,1,5],[7,0,4,6,9,1,3,2,5,8]];
export function verhoeffValid(num: string): boolean {
  if (!/^\d+$/.test(num)) return false; // letters/empty: just "invalid", never a crash
  let c = 0;
  const digits = num.split('').reverse().map(Number);
  for (let i = 0; i < digits.length; i++) c = D[c]![P[i % 8]![digits[i]!]!]!;
  return c === 0;
}
export const normalizeAadhaar = (s: string) => s.replace(/[\s-]/g, '');
export const isValidAadhaar = (s: string) => /^[2-9]\d{11}$/.test(s) && verhoeffValid(s);
export const normalizePan = (s: string) => s.replace(/\s/g, '').toUpperCase();
// 5 letters (4th = holder type: P person, C company, H HUF, F firm, A AOP, T trust, B BOI, L local authority, J juridical, G government), 4 digits, 1 letter
export const isValidPan = (s: string) => /^[A-Z]{3}[PCHFATBLJG][A-Z]\d{4}[A-Z]$/.test(s);

export const aadhaarSchema = z
  .string()
  .transform(normalizeAadhaar)
  .refine((v) => /^\d{12}$/.test(v), 'ಆಧಾರ್ 12 ಅಂಕಿಗಳು · Aadhaar must be 12 digits')
  .refine((v) => /^[2-9]/.test(v), 'ಆಧಾರ್ 0 ಅಥವಾ 1 ರಿಂದ ಆರಂಭವಾಗುವುದಿಲ್ಲ · Aadhaar cannot start with 0 or 1')
  .refine(verhoeffValid, 'ಆಧಾರ್ ಸಂಖ್ಯೆ ತಪ್ಪಾಗಿದೆ · This Aadhaar number is not valid — please check the digits');
export const panSchema = z
  .string()
  .transform(normalizePan)
  .refine((v) => v.length === 10, 'ಪ್ಯಾನ್ 10 ಅಕ್ಷರಗಳು · PAN must be 10 characters, e.g. ABCDE1234F')
  .refine(isValidPan, 'ಪ್ಯಾನ್ ಸ್ವರೂಪ ತಪ್ಪಾಗಿದೆ · PAN format is not valid (5 letters, 4 digits, 1 letter, e.g. ABCDE1234F)');
/** optional field: '' → undefined */
export const optional = <T extends z.ZodTypeAny>(s: T) =>
  z.preprocess((v) => (typeof v === 'string' && v.trim() === '' ? undefined : v), s.optional());

// ── Encryption ──
// Keep MFA_ENC_KEY stable: changing it makes stored numbers unreadable (masked last-4 still shows).
const secret = () => process.env.ID_ENC_KEY || env.MFA_ENC_KEY || env.SESSION_SECRET;
const encKey = () => Buffer.from(crypto.hkdfSync('sha256', secret(), 'kscwc', 'identity-encryption-v1', 32));
const macKey = () => Buffer.from(crypto.hkdfSync('sha256', secret(), 'kscwc', 'identity-fingerprint-v1', 32));

export function encrypt(plain: string): string {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', encKey(), iv);
  const ct = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return ['v1', iv.toString('base64'), c.getAuthTag().toString('base64'), ct.toString('base64')].join(':');
}
export function decrypt(token: string): string {
  const [v, iv, tag, ct] = token.split(':');
  if (v !== 'v1' || !iv || !tag || !ct) throw new Error('bad ciphertext');
  const d = crypto.createDecipheriv('aes-256-gcm', encKey(), Buffer.from(iv, 'base64'));
  d.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([d.update(Buffer.from(ct, 'base64')), d.final()]).toString('utf8');
}
export const fingerprint = (kind: 'aadhaar' | 'pan', value: string) =>
  crypto.createHmac('sha256', macKey()).update(`${kind}:${value}`).digest('hex');

// ── What gets stored / shown ──
export function protectAadhaar(a: string) {
  return { aadhaarEnc: encrypt(a), aadhaarLast4: a.slice(-4), aadhaarHash: fingerprint('aadhaar', a) };
}
export function protectPan(p: string) {
  return { panEnc: encrypt(p), panMasked: `${p.slice(0, 3)}XXXX${p.slice(7)}`, panHash: fingerprint('pan', p) };
}
export const maskAadhaar = (last4?: string | null) => (last4 ? `XXXX XXXX ${last4}` : null);

/** Logo address; the version comes from the upload (stable until the logo changes → cached). */
export function logoUrlFor(userId: string, logoKey?: string | null): string | null {
  if (!logoKey) return null;
  const v = /-(\d+)\.[a-z]+$/.exec(logoKey)?.[1] ?? '1';
  return `/api/v1/users/${userId}/logo?v=${v}`;
}
