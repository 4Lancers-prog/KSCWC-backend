// manual-topup.service.ts — UPI/QR top-ups: admin publishes a QR, users declare a UTR,
// admins verify and credit the wallet through the ledger exactly once.
import { nanoid } from 'nanoid';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../common/errors/app-error';
import { env } from '../../config/env';
import * as storage from '../../lib/storage';
import { postLedgerEntry } from '../wallet/wallet-ledger.service';
import { writeAudit } from '../audit/audit.service';
import { resolvePage, paginate, skip } from '../../common/utils/pagination';

interface Actor { id: string; requestId?: string; ip?: string | null }
const QR_KEY = 'payment_qr';

const IMAGE_RULES: Record<string, { ext: string; sniff: (b: Buffer) => boolean }> = {
  'image/png': { ext: 'png', sniff: (b) => b[0] === 0x89 && b[1] === 0x50 },
  'image/jpeg': { ext: 'jpg', sniff: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
};

type UploadFile = { buffer: Buffer; mimetype: string; size: number };

function validateImage(file: UploadFile): string {
  const rule = IMAGE_RULES[file.mimetype];
  if (!rule) throw AppError.badRequest('Only PNG or JPG images are allowed');
  if (file.size > env.MAX_UPLOAD_SIZE_BYTES) throw AppError.badRequest('Image is too large');
  if (!rule.sniff(file.buffer)) throw AppError.badRequest('Image content does not match its type');
  return rule.ext;
}

// ── Payment QR config (admin: settings:manage) ──
interface QrConfig { fileKey: string; mimeType: string; upiId: string; payeeName: string; note?: string }

async function readQr(): Promise<QrConfig | null> {
  const s = await prisma.systemSetting.findUnique({ where: { key: QR_KEY } });
  return (s?.value as QrConfig | undefined) ?? null;
}

export async function setPaymentQr(
  meta: { upiId: string; payeeName: string; note?: string },
  file: UploadFile | undefined,
  actor: Actor,
) {
  const prev = await readQr();
  let fileKey = prev?.fileKey;
  let mimeType = prev?.mimeType;
  if (file) {
    const ext = validateImage(file);
    fileKey = `payment-qr/${nanoid(20)}.${ext}`;
    mimeType = file.mimetype;
    await storage.putPrivate(fileKey, file.buffer, file.mimetype);
  }
  if (!fileKey || !mimeType) throw AppError.badRequest('A QR image is required');
  const value: QrConfig = { fileKey, mimeType, upiId: meta.upiId, payeeName: meta.payeeName, note: meta.note };
  await prisma.systemSetting.upsert({
    where: { key: QR_KEY },
    create: { key: QR_KEY, value: value as unknown as Prisma.InputJsonValue, updatedById: actor.id },
    update: { value: value as unknown as Prisma.InputJsonValue, updatedById: actor.id },
  });
  await writeAudit({ actorUserId: actor.id, action: 'payment_qr.update', entityType: 'system_setting', entityId: QR_KEY, requestId: actor.requestId, ip: actor.ip, after: { upiId: meta.upiId, payeeName: meta.payeeName } });
  return { upiId: value.upiId, payeeName: value.payeeName, note: value.note ?? null, imageUrl: '/api/v1/payment-qr/image' };
}

export async function getPaymentQrPublic() {
  const qr = await readQr();
  if (!qr) throw AppError.notFound('Payment QR is not configured yet');
  return { upiId: qr.upiId, payeeName: qr.payeeName, note: qr.note ?? null, imageUrl: '/api/v1/payment-qr/image' };
}

export async function getPaymentQrImage() {
  const qr = await readQr();
  if (!qr) throw AppError.notFound('Payment QR is not configured yet');
  return { buffer: await storage.getPrivate(qr.fileKey), mimeType: qr.mimeType };
}

// ── User: submit a manual top-up ──
export async function submitManualTopup(
  userId: string,
  input: { amountPaise: number; utrNumber: string; note?: string },
  file: UploadFile | undefined,
  actor: Actor,
) {
  if (input.amountPaise < env.WALLET_TOPUP_MIN_PAISE || input.amountPaise > env.WALLET_TOPUP_MAX_PAISE) {
    throw AppError.badRequest(
      `Top-up must be between ₹${env.WALLET_TOPUP_MIN_PAISE / 100} and ₹${env.WALLET_TOPUP_MAX_PAISE / 100}`,
      [{ field: 'amountPaise', message: 'Amount out of allowed range' }],
    );
  }
  const wallet = await prisma.walletAccount.findUnique({ where: { userId }, select: { id: true } });
  if (!wallet) throw AppError.notFound('Wallet not found');

  let screenshotKey: string | null = null;
  if (file) {
    const ext = validateImage(file);
    screenshotKey = `topup-proofs/${nanoid(20)}.${ext}`;
    await storage.putPrivate(screenshotKey, file.buffer, file.mimetype);
  }

  try {
    const row = await prisma.manualTopupRequest.create({
      data: {
        userId,
        amountPaise: BigInt(input.amountPaise),
        utrNumber: input.utrNumber,
        note: input.note ?? null,
        screenshotKey,
      },
    });
    await writeAudit({ actorUserId: userId, action: 'manual_topup.submit', entityType: 'manual_topup', entityId: row.id, requestId: actor.requestId, ip: actor.ip, after: { amountPaise: input.amountPaise, utrNumber: input.utrNumber } });
    return mapRequest(row);
  } catch (e) {
    if (isUnique(e)) throw new AppError(409, 'DUPLICATE_UTR', 'This UPI reference / UTR has already been submitted.');
    throw e;
  }
}

export async function listMyTopups(userId: string, q: { page?: number; limit?: number; status?: string }) {
  const page = resolvePage(q.page, q.limit);
  const where: Prisma.ManualTopupRequestWhereInput = {
    userId,
    ...(q.status ? { status: q.status as 'PENDING' | 'APPROVED' | 'REJECTED' } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.manualTopupRequest.findMany({ where, orderBy: { createdAt: 'desc' }, skip: skip(page), take: page.limit }),
    prisma.manualTopupRequest.count({ where }),
  ]);
  return paginate(items.map(mapRequest), total, page);
}

// ── Admin: list + approve + reject ──
export async function adminListTopups(q: { page?: number; limit?: number; status?: string }) {
  const page = resolvePage(q.page, q.limit);
  const where: Prisma.ManualTopupRequestWhereInput = q.status
    ? { status: q.status as 'PENDING' | 'APPROVED' | 'REJECTED' }
    : {};
  const [items, total] = await Promise.all([
    prisma.manualTopupRequest.findMany({
      where,
      orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
      skip: skip(page),
      take: page.limit,
      include: { user: { select: { fullName: true, phoneNormalized: true, centreName: true } } },
    }),
    prisma.manualTopupRequest.count({ where }),
  ]);
  const mapped = items.map((r) => ({
    ...mapRequest(r),
    user: { fullName: r.user.fullName, phone: r.user.phoneNormalized, centreName: r.user.centreName },
    hasScreenshot: !!r.screenshotKey,
  }));
  return paginate(mapped, total, page);
}

export async function getScreenshot(id: string) {
  const r = await prisma.manualTopupRequest.findUnique({ where: { id }, select: { screenshotKey: true } });
  if (!r?.screenshotKey) throw AppError.notFound('No payment screenshot for this request');
  const mimeType = r.screenshotKey.endsWith('.png') ? 'image/png' : 'image/jpeg';
  return { buffer: await storage.getPrivate(r.screenshotKey), mimeType };
}

export async function approveTopup(id: string, input: { amountPaise?: number; note?: string }, actor: Actor) {
  const entry = await prisma.$transaction(async (tx) => {
    // Lock the request row so two admins can't approve the same request concurrently.
    const locked = await tx.$queryRaw<{ status: string; user_id: string; amount_paise: bigint }[]>`
      SELECT status, user_id, amount_paise FROM manual_topup_requests WHERE id = ${id}::uuid FOR UPDATE
    `;
    if (locked.length === 0) throw AppError.notFound('Request not found');
    const row = locked[0]!;
    if (row.status !== 'PENDING') throw new AppError(409, 'ALREADY_REVIEWED', 'This request has already been reviewed.');
    const creditPaise = input.amountPaise ?? Number(row.amount_paise);
    if (creditPaise < env.WALLET_TOPUP_MIN_PAISE || creditPaise > env.WALLET_TOPUP_MAX_PAISE) {
      throw AppError.badRequest('Credited amount is outside the allowed range');
    }
    // Credit exactly once — idempotency key manual:<id> makes a double-approve a no-op.
    const tx1 = await postLedgerEntry(tx, {
      userId: row.user_id,
      type: 'TOPUP',
      direction: 'CREDIT',
      amountPaise: creditPaise,
      idempotencyKey: `manual:${id}`,
      referenceType: 'manual_topup',
      referenceId: id,
      description: 'Manual UPI top-up (approved)',
      createdById: actor.id,
    });
    await tx.manualTopupRequest.update({
      where: { id },
      data: {
        status: 'APPROVED',
        reviewedById: actor.id,
        reviewedAt: new Date(),
        reviewNote: input.note ?? null,
        creditedAmountPaise: BigInt(creditPaise),
        walletTransactionId: tx1.id,
      },
    });
    return tx1;
  });
  await writeAudit({ actorUserId: actor.id, action: 'manual_topup.approve', entityType: 'manual_topup', entityId: id, requestId: actor.requestId, ip: actor.ip, after: { walletTransactionId: entry.id, amountPaise: Number(entry.amountPaise) } });
  return { id, walletTransactionId: entry.id, creditedAmountPaise: Number(entry.amountPaise), balanceAfterPaise: Number(entry.balanceAfterPaise) };
}

export async function rejectTopup(id: string, input: { reason: string }, actor: Actor) {
  const r = await prisma.manualTopupRequest.findUnique({ where: { id }, select: { status: true } });
  if (!r) throw AppError.notFound('Request not found');
  if (r.status !== 'PENDING') throw new AppError(409, 'ALREADY_REVIEWED', 'This request has already been reviewed.');
  await prisma.manualTopupRequest.update({
    where: { id },
    data: { status: 'REJECTED', reviewedById: actor.id, reviewedAt: new Date(), reviewNote: input.reason },
  });
  await writeAudit({ actorUserId: actor.id, action: 'manual_topup.reject', entityType: 'manual_topup', entityId: id, requestId: actor.requestId, ip: actor.ip, after: { reason: input.reason } });
  return { id, status: 'REJECTED' as const };
}

function mapRequest(r: {
  id: string; amountPaise: bigint; utrNumber: string; note: string | null; status: string;
  reviewNote: string | null; creditedAmountPaise: bigint | null; createdAt: Date; reviewedAt: Date | null;
}) {
  return {
    id: r.id,
    amountPaise: Number(r.amountPaise),
    utrNumber: r.utrNumber,
    note: r.note,
    status: r.status,
    reviewNote: r.reviewNote,
    creditedAmountPaise: r.creditedAmountPaise != null ? Number(r.creditedAmountPaise) : null,
    createdAt: r.createdAt,
    reviewedAt: r.reviewedAt,
  };
}

function isUnique(e: unknown): boolean {
  return typeof e === 'object' && e !== null && 'code' in e && (e as { code?: string }).code === 'P2002';
}
