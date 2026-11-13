// test-db.ts — test database helpers: reset, supertest agent, CSRF handshake, user factories.
import type { Express } from 'express';
import request from 'supertest';
import argon2 from 'argon2';
import mongoose from 'mongoose';
import { ALL_MODELS, Service, User, WalletAccount } from '../../db/models';
import { connectDb, toPlain } from '../../lib/db';
import { SESSION_COLLECTION } from '../../lib/session-store';
import { CSRF_HEADER_NAME } from '../../config/constants';
import type { Role } from '../../shared/constants/roles';
import type { AccountStatus } from '../../shared/constants/account-status';

let indexesReady = false;

/** Empty every collection between tests (indexes are kept, so unique rules still apply). */
export async function resetDb(): Promise<void> {
  await connectDb();
  if (!indexesReady) {
    for (const m of ALL_MODELS) {
      await m.createCollection().catch(() => undefined);
      await m.syncIndexes();
    }
    indexesReady = true;
  }
  await Promise.all(ALL_MODELS.map((m) => m.deleteMany({})));
  await mongoose.connection.collection(SESSION_COLLECTION).deleteMany({});
}

type RealAgent = ReturnType<typeof request.agent>;
/** The real supertest agent, augmented with a self `agent` ref and the CSRF token,
 *  so tests can call `.get/.post/.patch` directly or pass it to the `post` helper. */
export type Agent = RealAgent & { agent: RealAgent; csrf: string };

/** A supertest agent that persists cookies, primed with a CSRF token. */
export async function makeAgent(app: Express): Promise<Agent> {
  const agent = request.agent(app);
  const res = await agent.get('/api/v1/auth/csrf');
  return Object.assign(agent, { agent, csrf: res.body.csrfToken as string });
}

/** POST helper that includes the CSRF header. */
export function post(a: Agent, path: string, body?: object | string) {
  return a.agent.post(path).set(CSRF_HEADER_NAME, a.csrf).send(body);
}

export async function createService(opts: { code: string; nameKn?: string; isActive?: boolean }) {
  await connectDb();
  const s = await Service.create({ code: opts.code, nameKn: opts.nameKn ?? opts.code, nameEn: opts.code, isActive: opts.isActive ?? true });
  return toPlain<{ id: string; code: string }>(s.toObject());
}

/** Create an ACTIVE user and return an agent already logged in as them. */
export async function loginAs(
  app: Express,
  opts: { phone: string; password?: string; role?: Role },
): Promise<{ agent: Agent; userId: string }> {
  const password = opts.password ?? 'password123456';
  const user = await createUser({ phone: opts.phone, password, role: opts.role, status: 'ACTIVE' });
  const agent = await makeAgent(app);
  await post(agent, '/api/v1/auth/login', { phone: opts.phone, password });
  return { agent, userId: user.id };
}

export async function createUser(opts: {
  phone: string;
  password?: string;
  role?: Role;
  status?: AccountStatus;
  fullName?: string;
}) {
  await connectDb();
  const passwordHash = await argon2.hash(opts.password ?? 'password123456', { type: argon2.argon2id });
  const user = await User.create({
    fullName: opts.fullName ?? 'Test User',
    phoneNormalized: opts.phone,
    passwordHash,
    role: opts.role ?? 'USER',
    accountStatus: opts.status ?? 'ACTIVE',
  });
  await WalletAccount.create({ userId: user._id });
  return { id: user._id, phoneNormalized: user.phoneNormalized };
}
