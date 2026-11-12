// applications.service.ts — insurance / membership / training / grievance submit + admin status.
import { z } from 'zod';
import { nanoid } from 'nanoid';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../common/errors/app-error';
import { normalizePhone, normalizeEmail, cleanText } from '../../common/utils/normalize';
import { resolvePage, paginate, type PageParams } from '../../common/utils/pagination';
import {
  insuranceSubmitSchema, membershipSubmitSchema, trainingSubmitSchema, grievanceSubmitSchema,
} from '../../shared/schemas/application.schema';
import { writeAudit } from '../audit/audit.service';

interface Actor { id?: string; requestId?: string; ip?: string | null }

export async function submitInsurance(input: z.infer<typeof insuranceSubmitSchema>, actor: Actor) {
  const row = await prisma.insuranceRequest.create({
    data: {
      submittedByUserId: actor.id ?? null,
      customerName: cleanText(input.customerName),
      mobileNormalized: normalizePhone(input.mobile),
      vehicleNumber: input.vehicleNumber ?? null,
      nomineeName: input.nomineeName ?? null,
      nomineeRelation: input.nomineeRelation ?? null,
      policyType: input.policyType ?? null,
      notes: input.notes ?? null,
      status: 'SUBMITTED',
    },
  });
  await writeAudit({ actorUserId: actor.id ?? null, action: 'insurance.submit', entityType: 'insurance_request', entityId: row.id, requestId: actor.requestId, ip: actor.ip });
  return { id: row.id, status: row.status };
}

export async function submitMembership(input: z.infer<typeof membershipSubmitSchema>, actor: Actor) {
  const row = await prisma.membershipApplication.create({
    data: {
      operatorName: cleanText(input.operatorName),
      centreName: cleanText(input.centreName),
      district: input.district,
      taluk: input.taluk,
      phoneNormalized: normalizePhone(input.phone),
      emailNormalized: normalizeEmail(input.email),
      status: 'SUBMITTED',
    },
  });
  await writeAudit({ actorUserId: actor.id ?? null, action: 'membership.submit', entityType: 'membership_application', entityId: row.id, requestId: actor.requestId, ip: actor.ip });
  return { id: row.id, status: row.status };
}

export async function submitTraining(input: z.infer<typeof trainingSubmitSchema>, actor: Actor) {
  const row = await prisma.trainingRegistration.create({
    data: {
      name: cleanText(input.name),
      phoneNormalized: normalizePhone(input.phone),
      topic: input.topic,
      mode: input.mode,
      notes: input.notes ?? null,
      status: 'REGISTERED',
    },
  });
  await writeAudit({ actorUserId: actor.id ?? null, action: 'training.submit', entityType: 'training_registration', entityId: row.id, requestId: actor.requestId, ip: actor.ip });
  return { id: row.id, status: row.status };
}

export async function submitGrievance(input: z.infer<typeof grievanceSubmitSchema>, actor: Actor) {
  const ticketCode = `GRV-${Date.now().toString(36).toUpperCase()}-${nanoid(4).toUpperCase()}`;
  const row = await prisma.grievance.create({
    data: {
      ticketCode,
      submittedByUserId: actor.id ?? null,
      name: cleanText(input.name),
      phoneNormalized: normalizePhone(input.phone),
      category: input.category,
      details: input.details,
      status: 'OPEN',
    },
  });
  await writeAudit({ actorUserId: actor.id ?? null, action: 'grievance.submit', entityType: 'grievance', entityId: row.id, requestId: actor.requestId, ip: actor.ip });
  return { id: row.id, ticketCode, status: row.status };
}

// ── Admin: list + status ──
type Kind = 'insurance' | 'membership' | 'training' | 'grievances';

const delegates = {
  insurance: prisma.insuranceRequest,
  membership: prisma.membershipApplication,
  training: prisma.trainingRegistration,
  grievances: prisma.grievance,
} as const;

export async function adminList(kind: Kind, page: PageParams, status?: string) {
  const d = delegates[kind] as { findMany: Function; count: Function };
  const where = status ? { status } : {};
  const [items, total] = await Promise.all([
    d.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page.page - 1) * page.limit, take: page.limit }),
    d.count({ where }),
  ]);
  return paginate(items, total, page);
}

export async function adminSetStatus(
  kind: Kind,
  id: string,
  status: string,
  actor: Actor,
  extra: { resolutionNote?: string } = {},
) {
  const d = delegates[kind] as { update: Function };
  const data: Record<string, unknown> = { status };
  if (kind === 'grievances') {
    if (extra.resolutionNote !== undefined) data.resolutionNote = extra.resolutionNote;
    if (status === 'RESOLVED' || status === 'CLOSED') data.resolvedAt = new Date();
  }
  let row;
  try {
    row = await d.update({ where: { id }, data });
  } catch {
    throw AppError.notFound('Application not found');
  }
  await writeAudit({ actorUserId: actor.id ?? null, action: `${kind}.status`, entityType: kind, entityId: id, requestId: actor.requestId, ip: actor.ip, after: { status } });
  return row;
}

export const page = resolvePage;
