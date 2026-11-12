// auth.repository.ts — data access for auth (users, wallet bootstrap, password resets, MFA).
import { prisma } from '../../lib/prisma';
import type { Prisma, User } from '@prisma/client';

export function findByPhone(phoneNormalized: string): Promise<User | null> {
  return prisma.user.findUnique({ where: { phoneNormalized } });
}

export function findByEmail(emailNormalized: string): Promise<User | null> {
  return prisma.user.findUnique({ where: { emailNormalized } });
}

export function findById(id: string): Promise<User | null> {
  return prisma.user.findUnique({ where: { id } });
}

/** Create the user and their (zero-balance) wallet account atomically. */
export async function createUserWithWallet(data: Prisma.UserCreateInput): Promise<User> {
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.create({ data });
    await tx.walletAccount.create({ data: { userId: user.id } });
    return user;
  });
}

export function updatePasswordHash(userId: string, passwordHash: string) {
  return prisma.user.update({ where: { id: userId }, data: { passwordHash } });
}

export function setMfa(userId: string, mfaSecret: string | null, mfaEnabled: boolean) {
  return prisma.user.update({ where: { id: userId }, data: { mfaSecret, mfaEnabled } });
}

// ── password reset tokens ──
export function createPasswordReset(userId: string, tokenHash: string, expiresAt: Date) {
  return prisma.passwordResetToken.create({ data: { userId, tokenHash, expiresAt } });
}

export function findActiveReset(tokenHash: string) {
  return prisma.passwordResetToken.findUnique({ where: { tokenHash } });
}

export function markResetUsed(id: string) {
  return prisma.passwordResetToken.update({ where: { id }, data: { usedAt: new Date() } });
}

/** Delete all connect-pg-simple sessions belonging to a user (e.g. after a password reset). */
export function deleteUserSessions(userId: string) {
  // The session store table is managed by connect-pg-simple; sess->>'userId' holds our id.
  return prisma.$executeRaw`DELETE FROM "session" WHERE sess->>'userId' = ${userId}`;
}
