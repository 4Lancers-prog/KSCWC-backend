// env.ts — Zod-validated environment loader. Fails fast if a required var is missing.
import 'dotenv/config';
import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  // MongoDB connection string, including the database name, e.g.
  // mongodb+srv://user:pass@cluster0.xxxxx.mongodb.net/kscwc?retryWrites=true&w=majority
  DATABASE_URL: z.string().regex(/^mongodb(\+srv)?:\/\//, 'DATABASE_URL must be a mongodb:// or mongodb+srv:// URL'),
  TEST_DATABASE_URL: z.string().optional(),

  SESSION_SECRET: z.string().min(16),
  CSRF_SECRET: z.string().min(16),
  // Dedicated key for encrypting TOTP secrets at rest. Keep it STABLE across deploys —
  // rotating it (or SESSION_SECRET, which it falls back to) makes stored MFA secrets undecryptable.
  MFA_ENC_KEY: z.string().optional().default(''),
  // When true, ADMIN/SUPER_ADMIN accounts must have TOTP MFA enrolled; until they do, their
  // session can reach only the MFA-setup routes. Off by default so first-run/local setup works;
  // production should set this to true (BPD §6.2, go-live checklist).
  ADMIN_MFA_REQUIRED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),

  SUPABASE_URL: z.string().optional().default(''),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional().default(''),
  OBJECT_STORAGE_BUCKET_PRIVATE: z.string().default('kscwc-private'),
  OBJECT_STORAGE_BUCKET_PUBLIC: z.string().default('kscwc-public'),

  APP_BASE_URL: z.string().url().default('http://localhost:5173'),
  API_PORT: z.coerce.number().int().positive().default(4000),
  CORS_ALLOWLIST: z.string().default('http://localhost:5173'),
  // 'lax' when the SPA and API share a site (same domain or the SPA proxies /api — recommended).
  // 'none' only when the SPA and API live on DIFFERENT sites (e.g. *.netlify.app + *.onrender.com);
  // that forces Secure cookies, so the API must be served over HTTPS.
  COOKIE_SAMESITE: z.enum(['lax', 'strict', 'none']).default('lax'),
  // Operator device rules: max registered devices per operator, and how long a signed-in device
  // may sit unused before another device is allowed to take over the login.
  OPERATOR_MAX_DEVICES: z.coerce.number().int().min(1).max(10).default(2),
  DEVICE_IDLE_MINUTES: z.coerce.number().int().min(1).max(24 * 60).default(30),
  // Shared secret between the Cloudflare Worker (which proxies /api) and this API. When a request
  // carries it, the visitor's real IP from the Worker is used for rate limiting and audit logs —
  // otherwise every user would appear to come from Cloudflare's few IPs and lock each other out.
  // Leave empty when not behind the Worker. Must match the Worker's PROXY_SHARED_SECRET.
  PROXY_SHARED_SECRET: z.string().optional().default(''),

  SENTRY_DSN: z.string().optional().default(''),
  DEFAULT_TIMEZONE: z.string().default('Asia/Kolkata'),
  FID_GENERATION_PRICE_PAISE: z.coerce.number().int().positive().default(500),
  WALLET_TOPUP_MIN_PAISE: z.coerce.number().int().positive().default(1000),
  WALLET_TOPUP_MAX_PAISE: z.coerce.number().int().positive().default(10_000_000),
  MAX_UPLOAD_SIZE_BYTES: z.coerce.number().int().positive().default(5_242_880),
});

// Hosts like Railway/Render tell the app which port to use via PORT.
const parsed = EnvSchema.safeParse({ ...process.env, API_PORT: process.env.API_PORT ?? process.env.PORT });
if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error('❌ Invalid environment variables:\n', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';
export const cookieSameSite = env.COOKIE_SAMESITE;
// SameSite=None cookies are rejected by browsers unless Secure.
export const cookieSecure = isProd || env.COOKIE_SAMESITE === 'none';
export const corsAllowlist = env.CORS_ALLOWLIST.split(',').map((s) => s.trim()).filter(Boolean);
