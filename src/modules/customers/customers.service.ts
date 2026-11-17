// customers.service.ts — customer business logic with ownership scoping, status history, audit.
import { Service } from '../../db/models';
import { connectDb, withTransaction } from '../../lib/db';
import { protectAadhaar, protectPan } from '../../lib/identity';
import { AppError } from '../../common/errors/app-error';
import { normalizePhone, cleanText } from '../../common/utils/normalize';
import { resolvePage, paginate, type PageParams } from '../../common/utils/pagination';
import { DUPLICATE_WINDOW_MS } from '../../config/constants';
import { canTransitionCustomer, type CustomerStatus } from '../../shared/constants/customer-status';
import { roleHas } from '../../config/permissions';
import type { Role } from '../../shared/constants/roles';
import type {
  CustomerCreateInput,
  CustomerUpdateInput,
  CustomerFilter,
} from '../../shared/schemas/customer.schema';
import { writeAudit } from '../audit/audit.service';
import * as repo from './customers.repository';

export interface Requester {
  id: string;
  role: Role;
  requestId?: string;
  ip?: string | null;
}

const canReadAll = (r: Requester) => roleHas(r.role, 'customers:read:all');

export async function createCustomer(input: CustomerCreateInput, actor: Requester) {
  await connectDb();
  const service = await Service.findById(input.serviceId).lean();
  if (!service || !service.isActive) {
    throw AppError.badRequest('Selected service is not available', [
      { field: 'serviceId', message: 'Choose an active service' },
    ]);
  }

  const mobile = normalizePhone(input.mobile);

  // Duplicate warning (prompt, don't hard-block legitimate repeats).
  if (!input.confirmDuplicate) {
    const recent = await repo.countRecentDuplicates(
      actor.id,
      mobile,
      input.serviceId,
      new Date(Date.now() - DUPLICATE_WINDOW_MS),
    );
    if (recent > 0) {
      throw new AppError(
        409,
        'DUPLICATE_WARNING',
        'You already added this mobile for this service recently. Confirm to add anyway.',
      );
    }
  }

  const customer = await withTransaction(async (tx) => {
    const created = await repo.create(
      {
        ownerUserId: actor.id,
        serviceId: input.serviceId,
        fullName: cleanText(input.fullName),
        mobileNormalized: mobile,
        referenceCode: input.referenceCode ? cleanText(input.referenceCode) : null,
        feePaise: input.feePaise ?? null,
        status: input.status ?? 'PENDING',
        notes: input.notes ?? null,
        ...(input.aadhaar ? protectAadhaar(input.aadhaar) : {}),
        ...(input.pan ? protectPan(input.pan) : {}),
        createdById: actor.id,
        updatedById: actor.id,
      },
      tx,
    );
    await repo.addStatusHistory(tx, {
      customerId: created.id,
      oldStatus: null,
      newStatus: created.status,
      changedById: actor.id,
      reason: 'created',
    });
    return created;
  });

  await writeAudit({
    actorUserId: actor.id,
    action: 'customer.create',
    entityType: 'customer',
    entityId: customer.id,
    requestId: actor.requestId,
    ip: actor.ip,
    after: { serviceId: input.serviceId, status: customer.status },
  });
  return customer;
}

/** Fetch one customer, enforcing ownership unless the requester may read all. */
export async function getCustomer(id: string, requester: Requester) {
  const customer = await repo.findById(id);
  if (!customer) throw AppError.notFound('Customer not found');
  if (customer.ownerUserId !== requester.id && !canReadAll(requester)) {
    throw AppError.notFound('Customer not found'); // do not reveal existence (IDOR-safe)
  }
  const history = await repo.listStatusHistory(id);
  return { customer, history };
}

export async function listCustomers(filter: CustomerFilter, requester: Requester) {
  const page: PageParams = resolvePage(filter.page, filter.limit);
  // Non-privileged users are always scoped to their own records.
  const ownerUserId = canReadAll(requester) ? filter.ownerUserId : requester.id;
  const where = repo.buildWhere({
    ownerUserId,
    status: filter.status,
    serviceId: filter.serviceId,
    search: filter.search,
    from: filter.from,
    to: filter.to,
  });
  const { items, total } = await repo.list(where, page);
  return paginate(items, total, page);
}

export async function updateCustomer(id: string, input: CustomerUpdateInput, actor: Requester) {
  const existing = await repo.findById(id);
  if (!existing) throw AppError.notFound('Customer not found');
  if (existing.ownerUserId !== actor.id && !canReadAll(actor)) {
    throw AppError.notFound('Customer not found');
  }

  const data: Record<string, unknown> = { updatedById: actor.id };
  if (input.fullName !== undefined) data.fullName = cleanText(input.fullName);
  if (input.mobile !== undefined) data.mobileNormalized = normalizePhone(input.mobile);
  if (input.serviceId !== undefined) data.serviceId = input.serviceId;
  if (input.referenceCode !== undefined)
    data.referenceCode = input.referenceCode ? cleanText(input.referenceCode) : null;
  if (input.feePaise !== undefined) data.feePaise = input.feePaise;
  if (input.notes !== undefined) data.notes = input.notes;
  if (input.aadhaar) Object.assign(data, protectAadhaar(input.aadhaar));
  else if (input.clearAadhaar) Object.assign(data, { aadhaarEnc: null, aadhaarLast4: null, aadhaarHash: null });
  if (input.pan) Object.assign(data, protectPan(input.pan));
  else if (input.clearPan) Object.assign(data, { panEnc: null, panMasked: null, panHash: null });

  const updated = await repo.update(id, data);
  await writeAudit({
    actorUserId: actor.id,
    action: 'customer.update',
    entityType: 'customer',
    entityId: id,
    requestId: actor.requestId,
    ip: actor.ip,
  });
  return updated;
}

export async function changeStatus(
  id: string,
  next: CustomerStatus,
  reason: string | undefined,
  actor: Requester,
) {
  const existing = await repo.findById(id);
  if (!existing) throw AppError.notFound('Customer not found');
  if (existing.ownerUserId !== actor.id && !canReadAll(actor)) {
    throw AppError.notFound('Customer not found');
  }
  if (existing.status === next) return existing;
  if (!canTransitionCustomer(existing.status, next)) {
    throw AppError.badRequest(`Cannot change status from ${existing.status} to ${next}`);
  }

  const updated = await withTransaction(async (tx) => {
    const u = await repo.update(id, { status: next, updatedById: actor.id }, tx);
    await repo.addStatusHistory(tx, {
      customerId: id,
      oldStatus: existing.status,
      newStatus: next,
      changedById: actor.id,
      reason: reason ?? null,
    });
    return u;
  });

  await writeAudit({
    actorUserId: actor.id,
    action: 'customer.status_change',
    entityType: 'customer',
    entityId: id,
    requestId: actor.requestId,
    ip: actor.ip,
    before: { status: existing.status },
    after: { status: next, reason },
  });
  return updated;
}
