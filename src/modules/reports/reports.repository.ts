// reports.repository.ts — server-side aggregates for customer reports.
import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';

export async function totals(where: Prisma.CustomerWhereInput) {
  const agg = await prisma.customer.aggregate({ where, _count: { _all: true }, _sum: { feePaise: true } });
  return { total: agg._count._all, feeTotalPaise: Number(agg._sum.feePaise ?? 0n) };
}

export async function byStatus(where: Prisma.CustomerWhereInput) {
  const rows = await prisma.customer.groupBy({ by: ['status'], where, _count: { _all: true } });
  return rows.map((r) => ({ status: r.status, count: r._count._all }));
}

export async function byService(where: Prisma.CustomerWhereInput) {
  const rows = await prisma.customer.groupBy({
    by: ['serviceId'],
    where,
    _count: { _all: true },
    _sum: { feePaise: true },
  });
  const services = await prisma.service.findMany({
    where: { id: { in: rows.map((r) => r.serviceId) } },
    select: { id: true, nameKn: true, nameEn: true, code: true },
  });
  const nameOf = new Map(services.map((s) => [s.id, s]));
  return rows.map((r) => ({
    serviceId: r.serviceId,
    nameKn: nameOf.get(r.serviceId)?.nameKn ?? '—',
    nameEn: nameOf.get(r.serviceId)?.nameEn ?? null,
    count: r._count._all,
    feeTotalPaise: Number(r._sum.feePaise ?? 0n),
  }));
}

/** Day-wise counts bucketed in Asia/Kolkata. Reads only createdAt (indexed), capped. */
export async function byDay(where: Prisma.CustomerWhereInput, cap = 20000) {
  const rows = await prisma.customer.findMany({ where, select: { createdAt: true }, take: cap });
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }); // YYYY-MM-DD
  const map = new Map<string, number>();
  for (const r of rows) {
    const day = fmt.format(r.createdAt);
    map.set(day, (map.get(day) ?? 0) + 1);
  }
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, count]) => ({ date, count }));
}
