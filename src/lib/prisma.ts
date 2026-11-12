// prisma.ts — Prisma client singleton. Uses TEST_DATABASE_URL under NODE_ENV=test.
import { PrismaClient } from '@prisma/client';
import { env, isTest } from '../config/env';

const datasourceUrl = isTest && env.TEST_DATABASE_URL ? env.TEST_DATABASE_URL : env.DATABASE_URL;

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasources: { db: { url: datasourceUrl } },
    log: env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

export type Db = PrismaClient;
