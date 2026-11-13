// session-store.ts — express-session stored in MongoDB (connect-mongo, collection "sessions").
// Sessions are stored as objects (stringify: false) so "sign out everywhere" can delete a user's
// sessions with a query on session.userId.
import session from 'express-session';
import MongoStore from 'connect-mongo';
import mongoose from 'mongoose';
import { env, cookieSameSite, cookieSecure } from '../config/env';
import { SESSION_COOKIE_NAME, SESSION_TTL_MS } from '../config/constants';
import { connectDb } from './db';

export const SESSION_COLLECTION = 'sessions';

const store = MongoStore.create({
  // connect-mongo bundles its own copy of the driver types; the client object is compatible.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  clientPromise: connectDb().then(() => mongoose.connection.getClient() as any),
  collectionName: SESSION_COLLECTION,
  stringify: false,
  ttl: Math.floor(SESSION_TTL_MS / 1000), // Mongo TTL index removes expired sessions
  autoRemove: 'native',
});

export const sessionMiddleware = session({
  name: SESSION_COOKIE_NAME,
  secret: env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  rolling: true,
  store,
  cookie: {
    httpOnly: true,
    secure: cookieSecure, // HTTPS only in production (and always with SameSite=None)
    sameSite: cookieSameSite,
    maxAge: SESSION_TTL_MS,
    path: '/',
  },
});

/** Delete every session belonging to a user (password reset, suspension). */
export async function deleteSessionsForUser(userId: string): Promise<number> {
  await connectDb();
  const res = await mongoose.connection.collection(SESSION_COLLECTION).deleteMany({ 'session.userId': userId });
  return res.deletedCount;
}

// Augment session data with the authenticated user id.
declare module 'express-session' {
  interface SessionData {
    userId?: string;
    // pending MFA challenge: user authenticated password but must present TOTP
    mfaPendingUserId?: string;
    // admin authenticated but MFA is required and not yet enrolled: session is
    // restricted to the MFA-setup routes until enrolment completes.
    mfaSetupRequired?: boolean;
  }
}
