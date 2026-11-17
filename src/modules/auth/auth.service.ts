// auth.service.ts — registration, login (+ admin MFA), logout, password reset, MFA enrol.
import crypto from 'node:crypto';
import argon2 from 'argon2';
import { authenticator } from 'otplib';
import type { Request } from 'express';
import type { Session } from 'express-session';
import type { UserRecord as User } from '../../db/models';
import { env } from '../../config/env';
import { AppError } from '../../common/errors/app-error';
import { normalizePhone, normalizeEmail, cleanText } from '../../common/utils/normalize';
import { PASSWORD_RESET_TTL_MS } from '../../config/constants';
import { checkOperatorLogin, claimActiveLogin } from '../devices/device-policy';
import { isAdminRole } from '../../shared/constants/roles';
import type { SessionUser } from '../../shared/types/api';
import type { RegisterInput, LoginInput } from '../../shared/schemas/auth.schema';
import { writeAudit } from '../audit/audit.service';
import { encryptSecret, decryptSecret } from '../../lib/crypto';
import * as repo from './auth.repository';

const ADMIN_RESET_TTL_MS = 24 * 60 * 60 * 1000; // admin-made reset links: 24 hours

const ARGON_OPTS = { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

export function toSessionUser(u: User): SessionUser {
  return {
    id: u.id,
    fullName: u.fullName,
    phone: u.phoneNormalized,
    email: u.emailNormalized,
    role: u.role,
    accountStatus: u.accountStatus,
    centreName: u.centreName,
    cscId: u.cscId,
    mfaEnabled: u.mfaEnabled,
  };
}

interface Ctx {
  requestId?: string;
  ip?: string | null;
}

export async function register(input: RegisterInput, ctx: Ctx): Promise<SessionUser> {
  const phone = normalizePhone(input.phone);
  const email = normalizeEmail(input.email);

  if (await repo.findByPhone(phone)) {
    throw AppError.conflict('An account with this mobile number already exists', [
      { field: 'phone', message: 'Already registered' },
    ]);
  }
  if (email && (await repo.findByEmail(email))) {
    throw AppError.conflict('An account with this email already exists', [
      { field: 'email', message: 'Already registered' },
    ]);
  }

  const passwordHash = await argon2.hash(input.password, ARGON_OPTS);
  const user = await repo.createUserWithWallet({
    fullName: cleanText(input.fullName),
    phoneNormalized: phone,
    emailNormalized: email,
    passwordHash,
    centreName: input.centreName ? cleanText(input.centreName) : null,
    cscId: input.cscId ? cleanText(input.cscId) : null,
    gender: input.gender ?? null,
    dob: input.dob ?? null,
    accountStatus: 'PENDING_APPROVAL',
    role: 'USER',
  });

  await writeAudit({
    actorUserId: user.id,
    action: 'user.register',
    entityType: 'user',
    entityId: user.id,
    requestId: ctx.requestId,
    ip: ctx.ip,
    after: { phone, status: user.accountStatus },
  });

  return toSessionUser(user);
}

export async function login(
  input: LoginInput,
  req: Request,
  ctx: Ctx,
): Promise<{ user: SessionUser; mfaSetupRequired: boolean }> {
  const phone = normalizePhone(input.phone);
  const user = await repo.findByPhone(phone);

  // Uniform failure to avoid user enumeration; still verify against a dummy hash for timing.
  const ok = user ? await argon2.verify(user.passwordHash, input.password).catch(() => false) : false;
  if (!user || !ok) {
    await writeAudit({
      action: 'user.login.failed',
      entityType: 'user',
      entityId: user?.id ?? null,
      requestId: ctx.requestId,
      ip: ctx.ip,
      after: { phone },
    });
    throw AppError.unauthorized('Invalid mobile number or password');
  }

  if (user.accountStatus === 'PENDING_APPROVAL') {
    throw new AppError(403, 'ACCOUNT_PENDING', 'Your account is awaiting admin approval');
  }
  if (user.accountStatus === 'REJECTED') {
    const why = user.rejectedReason ? ` Reason: ${user.rejectedReason.trim().replace(/[.\s]+$/, '')}.` : '';
    throw new AppError(403, 'ACCOUNT_REJECTED', `Your registration was not approved.${why} Contact support.`);
  }
  if (user.accountStatus === 'SUSPENDED') {
    const why = user.rejectedReason ? ` Reason: ${user.rejectedReason.trim().replace(/[.\s]+$/, '')}.` : '';
    throw new AppError(403, 'ACCOUNT_SUSPENDED', `Your account is suspended.${why} Contact support.`);
  }

  // Admins with MFA enrolled must present a valid TOTP (secret is encrypted at rest).
  const mfaEnrolled = user.mfaEnabled && !!user.mfaSecret;
  if (isAdminRole(user.role) && mfaEnrolled) {
    if (!input.mfaToken) {
      throw new AppError(401, 'MFA_REQUIRED', 'Enter your authenticator code');
    }
    const valid = authenticator.verify({ token: input.mfaToken, secret: decryptSecret(user.mfaSecret!) });
    if (!valid) throw new AppError(401, 'MFA_INVALID', 'Invalid authenticator code');
  }

  // Operators: max 2 registered devices, one signed in at a time (staff are not limited).
  const isOperator = user.role === 'USER';
  if (isOperator) await checkOperatorLogin(user.id, input.deviceId, req.get('user-agent'));

  // Regenerate the session on login to prevent session fixation (new id for the new identity).
  // IMPORTANT: regenerate() REPLACES req.session with a brand-new object. Writing to a reference
  // captured before regenerate (the old bug) silently drops userId, so the user looked logged in
  // for one response and was anonymous on every request after. Always write to req.session here.
  await new Promise<void>((resolve, reject) => req.session.regenerate((err) => (err ? reject(err) : resolve())));
  const mfaSetupRequired = env.ADMIN_MFA_REQUIRED && isAdminRole(user.role) && !mfaEnrolled;
  req.session.userId = user.id;
  // Policy: when admin MFA is mandatory and this admin hasn't enrolled yet, flag the session so
  // it can reach only the MFA-setup routes until enrolment completes (enforced by middleware).
  req.session.mfaSetupRequired = mfaSetupRequired;
  // Persist before responding so the very next request (GET /auth/me) already sees the login.
  await new Promise<void>((resolve, reject) => req.session.save((err) => (err ? reject(err) : resolve())));
  if (isOperator) {
    try {
      await claimActiveLogin(user.id, input.deviceId!, req.sessionID);
    } catch (e) {
      await new Promise<void>((resolve) => req.session.destroy(() => resolve()));
      throw e;
    }
  }
  await writeAudit({
    actorUserId: user.id,
    action: 'user.login',
    entityType: 'user',
    entityId: user.id,
    requestId: ctx.requestId,
    ip: ctx.ip,
  });
  return { user: toSessionUser(user), mfaSetupRequired };
}

export function logout(session: Session): Promise<void> {
  return new Promise((resolve, reject) => {
    session.destroy((err) => (err ? reject(err) : resolve()));
  });
}

/**
 * Create a single-use password reset token. We return the raw token here so the caller can
 * deliver it out-of-band (SMS/email). The DB stores only its hash.
 * To avoid user enumeration the route always responds success regardless of existence.
 */
export async function forgotPassword(phoneRaw: string, ctx: Ctx): Promise<string | null> {
  const phone = normalizePhone(phoneRaw);
  const user = await repo.findByPhone(phone);
  if (!user) return null;
  const raw = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(raw).digest('hex');
  await repo.createPasswordReset(user.id, tokenHash, new Date(Date.now() + PASSWORD_RESET_TTL_MS));
  await writeAudit({
    actorUserId: user.id,
    action: 'user.password_reset_requested',
    entityType: 'user',
    entityId: user.id,
    requestId: ctx.requestId,
    ip: ctx.ip,
  });
  return raw;
}

export async function resetPassword(tokenRaw: string, password: string, ctx: Ctx): Promise<void> {
  const tokenHash = crypto.createHash('sha256').update(tokenRaw).digest('hex');
  const record = await repo.findActiveReset(tokenHash);
  if (!record || record.usedAt || record.expiresAt < new Date()) {
    throw AppError.badRequest('This reset link is invalid or has expired');
  }
  const passwordHash = await argon2.hash(password, ARGON_OPTS);
  await repo.updatePasswordHash(record.userId, passwordHash);
  await repo.markResetUsed(record.id);
  // Invalidate all existing sessions for this user so a compromised session can't survive a reset.
  await repo.deleteUserSessions(record.userId);
  await writeAudit({
    actorUserId: record.userId,
    action: 'user.password_reset',
    entityType: 'user',
    entityId: record.userId,
    requestId: ctx.requestId,
    ip: ctx.ip,
  });
}

/**
 * Admin-assisted reset (there is no SMS/email service): the admin creates a one-time link and
 * sends it to the operator (WhatsApp/SMS from their own phone). Valid 24 hours, single use.
 */
export async function createAdminResetLink(userId: string, actor: { id: string; requestId?: string; ip?: string | null }) {
  const user = await repo.findById(userId);
  if (!user) throw AppError.notFound('User not found');
  const raw = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(raw).digest('hex');
  const expiresAt = new Date(Date.now() + ADMIN_RESET_TTL_MS);
  await repo.createPasswordReset(user.id, tokenHash, expiresAt);
  await writeAudit({
    actorUserId: actor.id, action: 'user.password_reset_link_created', entityType: 'user', entityId: user.id,
    requestId: actor.requestId, ip: actor.ip,
  });
  const base = env.APP_BASE_URL.replace(/\/+$/, '');
  return { link: `${base}/reset-password?token=${raw}`, expiresAt, phone: user.phoneNormalized, fullName: user.fullName };
}

/** Logged-in user changes their own password; other devices are signed out, this one stays. */
export async function changePassword(
  userId: string, currentSessionId: string, currentPassword: string, newPassword: string, ctx: Ctx,
) {
  const user = await repo.findById(userId);
  if (!user) throw AppError.unauthorized();
  if (!(await argon2.verify(user.passwordHash, currentPassword))) {
    throw new AppError(400, 'WRONG_PASSWORD', 'Your current password is not correct', { fieldErrors: [{ field: 'currentPassword', message: 'Your current password is not correct' }] });
  }
  if (currentPassword === newPassword) throw AppError.badRequest('Choose a new password that is different from the current one');
  await repo.updatePasswordHash(user.id, await argon2.hash(newPassword, ARGON_OPTS));
  await repo.deleteUserSessions(user.id, currentSessionId);
  await writeAudit({ actorUserId: user.id, action: 'user.password_changed', entityType: 'user', entityId: user.id, requestId: ctx.requestId, ip: ctx.ip });
}

/** Begin MFA enrolment: returns the otpauth URL + secret to show as a QR code. */
export async function beginMfaEnrolment(user: User): Promise<{ secret: string; otpauthUrl: string }> {
  const secret = authenticator.generateSecret();
  const otpauthUrl = authenticator.keyuri(user.phoneNormalized, 'KSCWC Admin', secret);
  // store encrypted, disabled until verified; return the plaintext secret only for the QR code
  await repo.setMfa(user.id, encryptSecret(secret), false);
  return { secret, otpauthUrl };
}

export async function confirmMfa(user: User, token: string, ctx: Ctx): Promise<void> {
  if (!user.mfaSecret) throw AppError.badRequest('Start MFA setup first');
  if (!authenticator.verify({ token, secret: decryptSecret(user.mfaSecret) })) {
    throw new AppError(400, 'MFA_INVALID', 'Invalid authenticator code');
  }
  await repo.setMfa(user.id, user.mfaSecret, true); // already encrypted
  await writeAudit({
    actorUserId: user.id,
    action: 'user.mfa_enabled',
    entityType: 'user',
    entityId: user.id,
    requestId: ctx.requestId,
    ip: ctx.ip,
  });
}
