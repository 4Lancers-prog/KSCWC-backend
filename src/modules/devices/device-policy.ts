// device-policy.ts — operator (role USER) device rules. Staff accounts are not limited.
//
//  1. At most OPERATOR_MAX_DEVICES (2) registered devices. A new device beyond that is refused
//     (DEVICE_LIMIT) until an admin removes one.
//  2. Only ONE device may be signed in at a time. Signing in on device B is refused
//     (ACTIVE_ON_OTHER_DEVICE) while device A's login is in use. A's login counts as abandoned —
//     and B may take over — when A logged out, its login expired/was ended, or A has been idle for
//     DEVICE_IDLE_MINUTES. A taken-over or ended login is signed out on its next request.
//
// A "device" is a browser: the frontend stores a random device id in localStorage and sends it on
// login. (Websites can't read hardware ids; clearing browser data = a new device.)
import mongoose from 'mongoose';
import { AppError } from '../../common/errors/app-error';
import { env } from '../../config/env';
import { User, UserDevice } from '../../db/models';
import { connectDb, toPlain } from '../../lib/db';
import { SESSION_COLLECTION } from '../../lib/session-store';

const idleMs = () => env.DEVICE_IDLE_MINUTES * 60_000;
const TOUCH_EVERY_MS = 60_000; // write lastSeenAt at most once a minute per login

/** "Chrome on Windows", "Safari on iPhone", … from a User-Agent string. */
export function deviceLabel(ua: string | undefined): string {
  const s = ua ?? '';
  const browser = /Edg\//.test(s) ? 'Edge' : /OPR\/|Opera/.test(s) ? 'Opera' : /SamsungBrowser/.test(s) ? 'Samsung Internet'
    : /Firefox\//.test(s) ? 'Firefox' : /Chrome\//.test(s) ? 'Chrome' : /Safari\//.test(s) ? 'Safari' : 'Browser';
  const os = /iPhone/.test(s) ? 'iPhone' : /iPad/.test(s) ? 'iPad' : /Android/.test(s) ? 'Android'
    : /Windows/.test(s) ? 'Windows' : /Mac OS X|Macintosh/.test(s) ? 'Mac' : /Linux/.test(s) ? 'Linux' : 'unknown OS';
  return `${browser} on ${os}`;
}

async function sessionExists(sessionId: string): Promise<boolean> {
  const doc = await mongoose.connection.collection(SESSION_COLLECTION).findOne(
    { _id: sessionId as never, expires: { $gt: new Date() } },
    { projection: { _id: 1 } },
  );
  return !!doc;
}

/** Is the operator's current login still in use by a DIFFERENT device? Returns that device's label. */
async function blockingDevice(userId: string, deviceId: string): Promise<string | null> {
  const user = await User.findById(userId).select('activeSession').lean();
  const a = user?.activeSession;
  if (!a?.sessionId || a.deviceId === deviceId) return null;
  if (!a.lastSeenAt || Date.now() - new Date(a.lastSeenAt).getTime() > idleMs()) return null; // idle → abandoned
  if (!(await sessionExists(a.sessionId))) return null; // logged out / expired / ended by admin
  const dev = await UserDevice.findOne({ userId, deviceId: a.deviceId }).select('label').lean();
  return dev?.label ?? 'another device';
}

/**
 * Before creating the session: register/verify the device and make sure no other device is in use.
 * Throws DEVICE_LIMIT (403) or ACTIVE_ON_OTHER_DEVICE (409).
 */
export async function checkOperatorLogin(userId: string, deviceId: string | undefined, userAgent?: string) {
  await connectDb();
  if (!deviceId) throw AppError.badRequest('Please reload the page and try again (missing device id).');

  const label = deviceLabel(userAgent);
  const known = await UserDevice.findOne({ userId, deviceId }).lean();
  if (!known) {
    const count = await UserDevice.countDocuments({ userId });
    if (count >= env.OPERATOR_MAX_DEVICES) {
      throw new AppError(
        403,
        'DEVICE_LIMIT',
        `This account is already registered on ${env.OPERATOR_MAX_DEVICES} devices. Ask the admin to remove an old device, then try again.`,
      );
    }
  }

  const other = await blockingDevice(userId, deviceId);
  if (other) {
    throw new AppError(
      409,
      'ACTIVE_ON_OTHER_DEVICE',
      `This account is signed in on another device (${other}). Log out there first, or try again after ${env.DEVICE_IDLE_MINUTES} minutes of inactivity.`,
    );
  }

  if (known) {
    await UserDevice.updateOne({ _id: known._id }, { $set: { label, lastSeenAt: new Date() } });
  } else {
    try {
      await UserDevice.create({ userId, deviceId, label });
    } catch (e) {
      if ((e as { code?: number }).code !== 11000) throw e; // same device registering twice at once: fine
    }
  }
}

/**
 * After the new session exists: make it THE active login. Atomic, so two devices signing in at the
 * same instant can't both win. Ends the previous (abandoned) login, if any.
 */
export async function claimActiveLogin(userId: string, deviceId: string, sessionId: string) {
  await connectDb();
  const user = await User.findById(userId).select('activeSession').lean();
  const prev = user?.activeSession ?? null;
  if (prev?.sessionId && prev.deviceId !== deviceId && (await blockingDevice(userId, deviceId))) {
    throw new AppError(409, 'ACTIVE_ON_OTHER_DEVICE', 'This account is signed in on another device. Log out there first.');
  }
  // Replace exactly the login we just inspected (compare-and-swap). If another device changed it in
  // the meantime, it won the race and this sign-in is refused. ({ activeSession: null } also
  // matches a missing field.)
  const filter = prev?.sessionId ? { _id: userId, 'activeSession.sessionId': prev.sessionId } : { _id: userId, activeSession: null };
  const res = await User.updateOne(filter, { $set: { activeSession: { sessionId, deviceId, lastSeenAt: new Date() } } });
  if (res.matchedCount === 0) {
    throw new AppError(409, 'ACTIVE_ON_OTHER_DEVICE', 'This account just signed in on another device. Log out there first.');
  }
  // The previous login's session is left in place on purpose: on its next request loadSession sees
  // it is no longer the active one, ends it, and tells that device why (SESSION_ENDED).
}

export type SessionCheck = 'ok' | 'ended';

/** Every request from an operator: is this still the active login? Also keeps lastSeenAt fresh. */
export async function checkActiveLogin(
  userId: string,
  sessionId: string,
  active: { sessionId: string; lastSeenAt: Date } | null | undefined,
): Promise<SessionCheck> {
  if (!active || active.sessionId !== sessionId) return 'ended';
  if (Date.now() - new Date(active.lastSeenAt).getTime() > TOUCH_EVERY_MS) {
    await User.updateOne({ _id: userId, 'activeSession.sessionId': sessionId }, { $set: { 'activeSession.lastSeenAt': new Date() } });
  }
  return 'ok';
}

/** Logout: free the slot so another device can sign in right away. */
export async function releaseActiveLogin(userId: string, sessionId: string) {
  await connectDb();
  await User.updateOne({ _id: userId, 'activeSession.sessionId': sessionId }, { $set: { activeSession: null } });
}

// ── Admin ──
export async function listDevices(userId: string) {
  await connectDb();
  const [devices, user] = await Promise.all([
    UserDevice.find({ userId }).sort({ createdAt: 1 }).lean(),
    User.findById(userId).select('activeSession').lean(),
  ]);
  if (!user) throw AppError.notFound('User not found');
  const a = user.activeSession;
  const activeAlive = !!a?.sessionId && (await sessionExists(a.sessionId));
  const idle = !a?.lastSeenAt || Date.now() - new Date(a.lastSeenAt).getTime() > idleMs();
  return {
    maxDevices: env.OPERATOR_MAX_DEVICES,
    idleMinutes: env.DEVICE_IDLE_MINUTES,
    devices: devices.map((d) => ({
      ...toPlain<{ id: string; label: string; createdAt: Date; lastSeenAt: Date }>(d),
      deviceId: undefined,
      signedIn: activeAlive && a?.deviceId === d.deviceId,
      idle: activeAlive && a?.deviceId === d.deviceId ? idle : null,
    })),
  };
}

/** Sign the operator out everywhere right now. */
export async function endActiveLogin(userId: string) {
  await connectDb();
  // Clearing activeSession is enough: every request checks it, so the device is signed out (with a
  // SESSION_ENDED message) the next time it does anything.
  const user = await User.findByIdAndUpdate(userId, { $set: { activeSession: null } }).select('_id').lean();
  if (!user) throw AppError.notFound('User not found');
}

/** Remove a registered device (frees a slot). Signs it out if it's the one in use. */
export async function removeDevice(userId: string, deviceRowId: string) {
  await connectDb();
  const dev = await UserDevice.findOneAndDelete({ _id: deviceRowId, userId }).lean();
  if (!dev) throw AppError.notFound('Device not found');
  const user = await User.findById(userId).select('activeSession').lean();
  if (user?.activeSession?.deviceId === dev.deviceId) await endActiveLogin(userId);
  return { label: dev.label };
}
