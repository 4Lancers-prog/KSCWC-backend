// applications.service.ts — insurance / membership / training / grievance submit + admin status.
import { z } from 'zod';
import { nanoid } from 'nanoid';
import type { Model } from 'mongoose';
import { Grievance, InsuranceRequest, MembershipApplication, TrainingRegistration } from '../../db/models';
import { connectDb, toPlain } from '../../lib/db';
import { AppError } from '../../common/errors/app-error';
import { normalizePhone, normalizeEmail, cleanText } from '../../common/utils/normalize';
import { resolvePage, paginate, type PageParams } from '../../common/utils/pagination';
import {
  insuranceSubmitSchema, membershipSubmitSchema, trainingSubmitSchema, grievanceSubmitSchema,
} from '../../shared/schemas/application.schema';
import { writeAudit } from '../audit/audit.service';

interface Actor { id?: string; requestId?: string; ip?: string | null }

export async function submitInsurance(input: z.infer<typeof insuranceSubmitSchema>, actor: Actor) {
  await connectDb();
  const row = toPlain<{ id: string; status: string }>((await InsuranceRequest.create({
    submittedByUserId: actor.id ?? null,
    customerName: cleanText(input.customerName),
    mobileNormalized: normalizePhone(input.mobile),
    vehicleNumber: input.vehicleNumber ?? null,
    nomineeName: input.nomineeName ?? null,
    nomineeRelation: input.nomineeRelation ?? null,
    policyType: input.policyType ?? null,
    notes: input.notes ?? null,
    status: 'SUBMITTED',
  })).toObject());
  await writeAudit({ actorUserId: actor.id ?? null, action: 'insurance.submit', entityType: 'insurance_request', entityId: row.id, requestId: actor.requestId, ip: actor.ip });
  return { id: row.id, status: row.status };
}

export async function submitMembership(input: z.infer<typeof membershipSubmitSchema>, actor: Actor) {
  await connectDb();
  const row = toPlain<{ id: string; status: string }>((await MembershipApplication.create({
    operatorName: cleanText(input.operatorName),
    centreName: cleanText(input.centreName),
    district: input.district,
    taluk: input.taluk,
    phoneNormalized: normalizePhone(input.phone),
    emailNormalized: normalizeEmail(input.email),
    submittedByUserId: actor.id ?? null,
    status: 'SUBMITTED',
  })).toObject());
  await writeAudit({ actorUserId: actor.id ?? null, action: 'membership.submit', entityType: 'membership_application', entityId: row.id, requestId: actor.requestId, ip: actor.ip });
  return { id: row.id, status: row.status };
}

export async function submitTraining(input: z.infer<typeof trainingSubmitSchema>, actor: Actor) {
  await connectDb();
  const row = toPlain<{ id: string; status: string }>((await TrainingRegistration.create({
    name: cleanText(input.name),
    phoneNormalized: normalizePhone(input.phone),
    topic: input.topic,
    mode: input.mode,
    notes: input.notes ?? null,
    submittedByUserId: actor.id ?? null,
    status: 'REGISTERED',
  })).toObject());
  await writeAudit({ actorUserId: actor.id ?? null, action: 'training.submit', entityType: 'training_registration', entityId: row.id, requestId: actor.requestId, ip: actor.ip });
  return { id: row.id, status: row.status };
}

export async function submitGrievance(input: z.infer<typeof grievanceSubmitSchema>, actor: Actor) {
  const ticketCode = `GRV-${Date.now().toString(36).toUpperCase()}-${nanoid(4).toUpperCase()}`;
  await connectDb();
  const row = toPlain<{ id: string; status: string }>((await Grievance.create({
    ticketCode,
    submittedByUserId: actor.id ?? null,
    name: cleanText(input.name),
    phoneNormalized: normalizePhone(input.phone),
    category: input.category,
    details: input.details,
    status: 'OPEN',
  })).toObject());
  await writeAudit({ actorUserId: actor.id ?? null, action: 'grievance.submit', entityType: 'grievance', entityId: row.id, requestId: actor.requestId, ip: actor.ip });
  return { id: row.id, ticketCode, status: row.status };
}

// ── Admin: list + status ──
type Kind = 'insurance' | 'membership' | 'training' | 'grievances';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const delegates: Record<Kind, Model<any>> = {
  insurance: InsuranceRequest,
  membership: MembershipApplication,
  training: TrainingRegistration,
  grievances: Grievance,
};

export async function adminList(kind: Kind, page: PageParams, status?: string) {
  await connectDb();
  const d = delegates[kind];
  const where = status ? { status } : {};
  const [items, total] = await Promise.all([
    d.find(where).sort({ createdAt: -1 }).skip((page.page - 1) * page.limit).limit(page.limit).lean(),
    d.countDocuments(where),
  ]);
  return paginate(toPlain<Record<string, unknown>[]>(items), total, page);
}

export async function adminSetStatus(
  kind: Kind,
  id: string,
  status: string,
  actor: Actor,
  extra: { resolutionNote?: string } = {},
) {
  await connectDb();
  const d = delegates[kind];
  const data: Record<string, unknown> = { status };
  if (kind === 'grievances') {
    if (extra.resolutionNote !== undefined) data.resolutionNote = extra.resolutionNote;
    if (status === 'RESOLVED' || status === 'CLOSED') data.resolvedAt = new Date();
  }
  const updated = await d.findByIdAndUpdate(id, { $set: data }, { new: true, runValidators: true }).lean();
  if (!updated) throw AppError.notFound('Application not found');
  const row = toPlain<Record<string, unknown>>(updated);
  await writeAudit({ actorUserId: actor.id ?? null, action: `${kind}.status`, entityType: kind, entityId: id, requestId: actor.requestId, ip: actor.ip, after: { status } });
  return row;
}

export const page = resolvePage;
