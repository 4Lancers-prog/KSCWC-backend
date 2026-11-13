// auth.repository.ts — data access for auth (users, wallet bootstrap, password resets, MFA).
import { User, WalletAccount, PasswordResetToken, type UserRecord } from '../../db/models';
import { connectDb, toPlain, withTransaction } from '../../lib/db';
import { deleteSessionsForUser } from '../../lib/session-store';

// Auth needs the secret fields that are hidden by default.
const SECRET = '+passwordHash +mfaSecret';

function normalize(u: unknown): UserRecord | null {
  if (!u) return null;
  const p = toPlain<UserRecord>(u);
  return { ...p, emailNormalized: p.emailNormalized ?? null };
}

export async function findByPhone(phoneNormalized: string): Promise<UserRecord | null> {
  await connectDb();
  return normalize(await User.findOne({ phoneNormalized }).select(SECRET).lean());
}

export async function findByEmail(emailNormalized: string): Promise<UserRecord | null> {
  await connectDb();
  return normalize(await User.findOne({ emailNormalized }).select(SECRET).lean());
}

export async function findById(id: string): Promise<UserRecord | null> {
  await connectDb();
  return normalize(await User.findById(id).select(SECRET).lean());
}

/** Create the user and their (zero-balance) wallet account atomically. */
export async function createUserWithWallet(data: Partial<UserRecord> & { fullName: string; phoneNormalized: string; passwordHash: string }): Promise<UserRecord> {
  return withTransaction(async (session) => {
    const clean = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined && v !== null || false));
    const [user] = await User.create([clean], { session });
    await WalletAccount.create([{ userId: user!._id }], { session });
    return normalize(user!.toObject())!;
  });
}

export async function updatePasswordHash(userId: string, passwordHash: string) {
  await connectDb();
  return User.updateOne({ _id: userId }, { $set: { passwordHash } });
}

export async function setMfa(userId: string, mfaSecret: string | null, mfaEnabled: boolean) {
  await connectDb();
  return User.updateOne({ _id: userId }, { $set: { mfaSecret, mfaEnabled } });
}

// ── password reset tokens ──
export async function createPasswordReset(userId: string, tokenHash: string, expiresAt: Date) {
  await connectDb();
  return toPlain((await PasswordResetToken.create({ userId, tokenHash, expiresAt })).toObject());
}

export async function findActiveReset(tokenHash: string) {
  await connectDb();
  return toPlain<{ id: string; userId: string; expiresAt: Date; usedAt: Date | null } | null>(
    await PasswordResetToken.findOne({ tokenHash }).lean(),
  );
}

export async function markResetUsed(id: string) {
  await connectDb();
  return PasswordResetToken.updateOne({ _id: id }, { $set: { usedAt: new Date() } });
}

/** Delete every stored session belonging to a user (e.g. after a password reset). */
export function deleteUserSessions(userId: string) {
  return deleteSessionsForUser(userId);
}
