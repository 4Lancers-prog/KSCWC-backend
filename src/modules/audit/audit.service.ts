// audit.service.ts — append-only audit trail writer. Never throws into the caller's path.
import crypto from 'node:crypto';
import { AuditLog } from '../../db/models';
import { connectDb } from '../../lib/db';
import { logger } from '../../lib/logger';

export interface AuditInput {
  actorUserId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  requestId?: string | null;
  before?: unknown;
  after?: unknown;
  ip?: string | null;
}

export function hashIp(ip?: string | null): string | null {
  if (!ip) return null;
  return crypto.createHash('sha256').update(ip).digest('hex').slice(0, 32);
}

const PII_KEYS = new Set([
  'password',
  'passwordHash',
  'password_hash',
  'mfaSecret',
  'tokenHash',
  'aadhaar',
  'maskedAadhaar',
]);

/** Shallow redaction of known-sensitive keys before persisting audit snapshots. */
function redact(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = PII_KEYS.has(k) ? '[redacted]' : v;
  }
  return out;
}

export async function writeAudit(input: AuditInput): Promise<void> {
  try {
    await connectDb();
    await AuditLog.create({
      actorUserId: input.actorUserId ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      requestId: input.requestId ?? null,
      beforeRedacted: redact(input.before) ?? null,
      afterRedacted: redact(input.after) ?? null,
      ipHash: hashIp(input.ip),
    });
  } catch (err) {
    // Audit must never break the business operation; log and continue.
    logger.error({ err, action: input.action }, 'failed to write audit log');
  }
}
