// test-db.ts — test database helpers: reset, supertest agent, CSRF handshake, user factories.
import type { Express } from 'express';
import request from 'supertest';
import argon2 from 'argon2';
import { prisma } from '../../lib/prisma';
import { CSRF_HEADER_NAME } from '../../config/constants';
import type { Role } from '../../shared/constants/roles';
import type { AccountStatus } from '../../shared/constants/account-status';

/** Truncate all application tables between tests (session table left to connect-pg-simple). */
export async function resetDb(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      audit_logs, password_reset_tokens, customer_status_history, customers,
      wallet_transactions, wallet_accounts, fid_generations, payment_events, payment_orders,
      announcements, committee_members, government_links, documents,
      insurance_requests, membership_applications, training_registrations, grievances,
      system_settings, services, users
    RESTART IDENTITY CASCADE
  `);
}

export interface Agent {
  agent: request.Agent;
  csrf: string;
}

/** A supertest agent that persists cookies, primed with a CSRF token. */
export async function makeAgent(app: Express): Promise<Agent> {
  const agent = request.agent(app);
  const res = await agent.get('/api/v1/auth/csrf');
  return { agent, csrf: res.body.csrfToken as string };
}

/** POST helper that includes the CSRF header. */
export function post(a: Agent, path: string, body?: unknown) {
  return a.agent.post(path).set(CSRF_HEADER_NAME, a.csrf).send(body);
}

export async function createService(opts: { code: string; nameKn?: string; isActive?: boolean }) {
  return prisma.service.create({
    data: {
      code: opts.code,
      nameKn: opts.nameKn ?? opts.code,
      nameEn: opts.code,
      isActive: opts.isActive ?? true,
    },
  });
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
  const passwordHash = await argon2.hash(opts.password ?? 'password123456', {
    type: argon2.argon2id,
  });
  const user = await prisma.user.create({
    data: {
      fullName: opts.fullName ?? 'Test User',
      phoneNormalized: opts.phone,
      passwordHash,
      role: opts.role ?? 'USER',
      accountStatus: opts.status ?? 'ACTIVE',
    },
  });
  await prisma.walletAccount.create({ data: { userId: user.id } });
  return user;
}
