// reports.repository.ts — server-side aggregates for customer reports (MongoDB aggregation).
import { Customer, Service } from '../../db/models';
import { connectDb } from '../../lib/db';
import type { CustomerFilter } from '../customers/customers.repository';

export async function totals(where: CustomerFilter) {
  await connectDb();
  const [agg] = await Customer.aggregate<{ total: number; feeTotalPaise: number }>([
    { $match: where },
    { $group: { _id: null, total: { $sum: 1 }, feeTotalPaise: { $sum: { $ifNull: ['$feePaise', 0] } } } },
  ]);
  return { total: agg?.total ?? 0, feeTotalPaise: agg?.feeTotalPaise ?? 0 };
}

export async function byStatus(where: CustomerFilter) {
  await connectDb();
  const rows = await Customer.aggregate<{ _id: string; count: number }>([
    { $match: where },
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ]);
  return rows.map((r) => ({ status: r._id, count: r.count }));
}

export async function byService(where: CustomerFilter) {
  await connectDb();
  const rows = await Customer.aggregate<{ _id: string; count: number; fee: number }>([
    { $match: where },
    { $group: { _id: '$serviceId', count: { $sum: 1 }, fee: { $sum: { $ifNull: ['$feePaise', 0] } } } },
  ]);
  const services = await Service.find({ _id: { $in: rows.map((r) => r._id) } }).select('nameKn nameEn code').lean();
  const nameOf = new Map(services.map((s) => [s._id, s]));
  return rows.map((r) => ({
    serviceId: r._id,
    nameKn: nameOf.get(r._id)?.nameKn ?? '—',
    nameEn: nameOf.get(r._id)?.nameEn ?? null,
    count: r.count,
    feeTotalPaise: r.fee,
  }));
}

/** Day-wise counts bucketed in Asia/Kolkata. */
export async function byDay(where: CustomerFilter) {
  await connectDb();
  const rows = await Customer.aggregate<{ _id: string; count: number }>([
    { $match: where },
    { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: 'Asia/Kolkata' } }, count: { $sum: 1 } } },
    { $sort: { _id: 1 } },
  ]);
  return rows.map((r) => ({ date: r._id, count: r.count }));
}
