// db.ts — MongoDB (Mongoose) connection + helpers.
//
// Transactions need a replica set: MongoDB Atlas always is one (including the free M0 tier).
// For local development run `mongod --replSet rs0` once and `rs.initiate()` (see README).
import mongoose, { type ClientSession } from 'mongoose';
import { env, isTest } from '../config/env';
import { logger } from './logger';

mongoose.set('strictQuery', true);

export const mongoUri = isTest && env.TEST_DATABASE_URL ? env.TEST_DATABASE_URL : env.DATABASE_URL;

let connecting: Promise<typeof mongoose> | null = null;

/** Connect once (idempotent). Called at startup and lazily by tests. */
export function connectDb(): Promise<typeof mongoose> {
  if (!connecting) {
    connecting = mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 10_000 }).then((m) => {
      logger.info(`MongoDB connected (${m.connection.name})`);
      return m;
    });
  }
  return connecting;
}

export async function disconnectDb(): Promise<void> {
  await mongoose.disconnect();
  connecting = null;
}

export type Tx = ClientSession;

/**
 * Run `fn` inside a multi-document transaction. Retries automatically on transient
 * write conflicts (that is how MongoDB serialises two concurrent wallet charges).
 */
export async function withTransaction<T>(fn: (session: ClientSession) => Promise<T>): Promise<T> {
  await connectDb();
  const session = await mongoose.startSession();
  try {
    let result!: T;
    await session.withTransaction(async () => {
      result = await fn(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
}

/**
 * Convert a lean Mongo document (or array / nested value) to the API shape the frontend already
 * uses: `_id` → `id`, `__v` dropped. Dates and plain values pass through untouched.
 */
export function toPlain<T = any>(value: unknown): T {
  if (Array.isArray(value)) return value.map((v) => toPlain(v)) as T;
  if (value && typeof value === 'object' && !(value instanceof Date) && !(value instanceof Buffer)) {
    const src = value as Record<string, unknown>;
    if (typeof (src as { toObject?: unknown }).toObject === 'function') {
      // hydrated (non-lean) document → plain object first
      return toPlain((src as unknown as { toObject: () => unknown }).toObject());
    }
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(src)) {
      if (k === '__v') continue;
      if (k === '_id') out.id = v;
      else out[k] = toPlain(v);
    }
    return out as T;
  }
  return value as T;
}

/** Duplicate-key error (unique index) → which fields collided. */
export function duplicateKeyFields(err: unknown): string[] | null {
  const e = err as { code?: number; keyPattern?: Record<string, unknown> };
  if (e && e.code === 11000) return Object.keys(e.keyPattern ?? {});
  return null;
}

/** Escape user text for use inside a RegExp (case-insensitive "contains" search). */
export function containsRegex(text: string): RegExp {
  return new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
}
