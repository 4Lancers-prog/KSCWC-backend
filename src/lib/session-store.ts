// session-store.ts — express-session configured with a Postgres (connect-pg-simple) store.
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import pg from 'pg';
import { env, isProd, isTest } from '../config/env';
import { SESSION_COOKIE_NAME, SESSION_TTL_MS } from '../config/constants';

const PgStore = connectPgSimple(session);

// Dedicated pool for the session table (connect-pg-simple creates/uses "session").
const pool = new pg.Pool({
  connectionString: isTest && env.TEST_DATABASE_URL ? env.TEST_DATABASE_URL : env.DATABASE_URL,
  max: 5,
});

export const sessionMiddleware = session({
  name: SESSION_COOKIE_NAME,
  secret: env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  rolling: true,
  store: new PgStore({ pool, createTableIfMissing: true, tableName: 'session' }),
  cookie: {
    httpOnly: true,
    secure: isProd, // HTTPS only in production
    sameSite: 'lax',
    maxAge: SESSION_TTL_MS,
    path: '/',
  },
});

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
