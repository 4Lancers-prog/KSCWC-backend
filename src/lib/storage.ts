// storage.ts — private file storage with a swappable backend.
//   • local filesystem (default, for dev/self-host)
//   • Supabase private Storage (when SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are set)
// Object keys + metadata always live in Postgres; only the bytes live here. The public API
// (putPrivate / getPrivate / existsPrivate / getSignedUrl) is identical for both backends, so
// no caller changes when switching. Routes stream via getPrivate (authenticated streaming);
// getSignedUrl is available when you prefer short-lived signed links.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { env } from '../config/env';

export interface StorageBackend {
  putPrivate(key: string, data: Buffer, contentType?: string): Promise<string>;
  getPrivate(key: string): Promise<Buffer>;
  existsPrivate(key: string): Promise<boolean>;
  getSignedUrl(key: string, expiresInSeconds?: number): Promise<string | null>;
}

// ── Local filesystem backend ──────────────────────────────────────────────
const ROOT = process.env.STORAGE_DIR ? path.resolve(process.env.STORAGE_DIR) : path.resolve(process.cwd(), 'storage');
const PRIVATE_DIR = path.join(ROOT, 'private');

function safeResolve(key: string): string {
  const normalized = path.normalize(key).replace(/^(\.\.(\/|\\|$))+/, '');
  const full = path.join(PRIVATE_DIR, normalized);
  if (!full.startsWith(PRIVATE_DIR)) throw new Error('Invalid storage key');
  return full;
}

const localBackend: StorageBackend = {
  async putPrivate(key, data) {
    const full = safeResolve(key);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, data);
    return key;
  },
  getPrivate: (key) => fs.readFile(safeResolve(key)),
  async existsPrivate(key) {
    try {
      await fs.access(safeResolve(key));
      return true;
    } catch {
      return false;
    }
  },
  // No signed URLs for local fs — routes stream via getPrivate instead.
  getSignedUrl: async () => null,
};

// ── Supabase private Storage backend ──────────────────────────────────────
function createSupabaseBackend(): StorageBackend {
  const client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  const bucket = env.OBJECT_STORAGE_BUCKET_PRIVATE;

  return {
    async putPrivate(key, data, contentType) {
      const { error } = await client.storage.from(bucket).upload(key, data, {
        contentType: contentType ?? 'application/octet-stream',
        upsert: true,
      });
      if (error) throw new Error(`storage upload failed: ${error.message}`);
      return key;
    },
    async getPrivate(key) {
      const { data, error } = await client.storage.from(bucket).download(key);
      if (error || !data) throw new Error(`storage download failed: ${error?.message ?? 'not found'}`);
      return Buffer.from(await data.arrayBuffer());
    },
    async existsPrivate(key) {
      const { data } = await client.storage.from(bucket).download(key);
      return !!data;
    },
    async getSignedUrl(key, expiresInSeconds = 300) {
      const { data, error } = await client.storage.from(bucket).createSignedUrl(key, expiresInSeconds);
      if (error || !data) return null;
      return data.signedUrl;
    },
  };
}

const useSupabase = !!(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY);
const backend: StorageBackend = useSupabase ? createSupabaseBackend() : localBackend;

export const putPrivate = (key: string, data: Buffer, contentType?: string) => backend.putPrivate(key, data, contentType);
export const getPrivate = (key: string) => backend.getPrivate(key);
export const existsPrivate = (key: string) => backend.existsPrivate(key);
export const getSignedUrl = (key: string, expiresInSeconds?: number) => backend.getSignedUrl(key, expiresInSeconds);
export const storageBackendName = useSupabase ? 'supabase' : 'local-fs';
