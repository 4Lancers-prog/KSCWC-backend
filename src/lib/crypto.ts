// crypto.ts — authenticated encryption for secrets at rest (AES-256-GCM).
// Used to encrypt TOTP MFA secrets so a database leak alone cannot defeat MFA.
// Key is derived from MFA_ENC_KEY (preferred) or SESSION_SECRET via scrypt.
import crypto from 'node:crypto';
import { env } from '../config/env';

const key = crypto.scryptSync(process.env.MFA_ENC_KEY || env.SESSION_SECRET, 'kscwc-secret-enc-v1', 32);

/** Returns "iv.tag.ciphertext" (all base64). */
export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}.${tag.toString('base64')}.${enc.toString('base64')}`;
}

/** Decrypts a value produced by encryptSecret. Legacy plaintext (no dots) is returned as-is. */
export function decryptSecret(blob: string): string {
  const parts = blob.split('.');
  if (parts.length !== 3) return blob; // backward-compat with any pre-encryption value
  const [ivb, tagb, encb] = parts as [string, string, string];
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivb, 'base64'));
  decipher.setAuthTag(Buffer.from(tagb, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(encb, 'base64')), decipher.final()]).toString('utf8');
}
