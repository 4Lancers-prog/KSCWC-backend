// manual-topup.service.ts — UPI/QR top-ups: admin publishes a QR, users declare a UTR,
// admins verify and credit the wallet through the ledger exactly once.
import { nanoid } from 'nanoid';
import { ManualTopupRequest, SystemSetting, User, WalletAccount } from '../../db/models';
import { connectDb, duplicateKeyFields, withTransaction } from '../../lib/db';
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
  await connectDb();
  const s = await SystemSetting.findById(QR_KEY).lean();
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
  await SystemSetting.updateOne({ _id: QR_KEY }, { $set: { value, updatedById: actor.id } }, { upsert: true });
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
  await connectDb();
  const wallet = await WalletAccount.exists({ userId });
  if (!wallet) throw AppError.notFound('Wallet not found');

  let screenshotKey: string | null = null;
  if (file) {
    const ext = validateImage(file);
    screenshotKey = `topup-proofs/${nanoid(20)}.${ext}`;
    await storage.putPrivate(screenshotKey, file.buffer, file.mimetype);
  }

  try {
    const row = (
      await ManualTopupRequest.create({
        userId,
        amountPaise: input.amountPaise,
        utrNumber: input.utrNumber,
        note: input.note ?? null,
        screenshotKey,
      })
    ).toObject();
    await writeAudit({ actorUserId: userId, action: 'manual_topup.submit', entityType: 'manual_topup', entityId: row._id, requestId: actor.requestId, ip: actor.ip, after: { amountPaise: input.amountPaise, utrNumber: input.utrNumber } });
    return mapRequest(row);
  } catch (e) {
    if (isUnique(e)) throw new AppError(409, 'DUPLICATE_UTR', 'This UPI reference / UTR has already been submitted.');
    throw e;
  }
}

export async function listMyTopups(userId: string, q: { page?: number; limit?: number; status?: string }) {
  const page = resolvePage(q.page, q.limit);
  await connectDb();
  const where = { userId, ...(q.status ? { status: q.status } : {}) };
  const [items, total] = await Promise.all([
    ManualTopupRequest.find(where).sort({ createdAt: -1 }).skip(skip(page)).limit(page.limit).lean(),
    ManualTopupRequest.countDocuments(where),
  ]);
  return paginate(items.map(mapRequest), total, page);
}

// ── Admin: list + approve + reject ──
export async function adminListTopups(q: { page?: number; limit?: number; status?: string }) {
  const page = resolvePage(q.page, q.limit);
  await connectDb();
  const where = q.status ? { status: q.status } : {};
  const [items, total] = await Promise.all([
    // Pending first (oldest first, so the queue is worked in order), then reviewed ones.
    ManualTopupRequest.aggregate([
      { $match: where },
      { $addFields: { _order: { $indexOfArray: [['PENDING', 'APPROVED', 'REJECTED'], '$status'] } } },
      { $sort: { _order: 1, createdAt: 1 } },
      { $skip: skip(page) },
      { $limit: page.limit },
    ]),
    ManualTopupRequest.countDocuments(where),
  ]);
  const users = await User.find({ _id: { $in: items.map((r) => r.userId) } }).select('fullName phoneNormalized centreName').lean();
  const byId = new Map(users.map((u) => [u._id, u]));
  const mapped = items.map((r) => {
    const u = byId.get(r.userId);
    return {
      ...mapRequest(r),
      user: { fullName: u?.fullName ?? '—', phone: u?.phoneNormalized ?? '', centreName: u?.centreName ?? null },
      hasScreenshot: !!r.screenshotKey,
    };
  });
  return paginate(mapped, total, page);
}

export async function getScreenshot(id: string) {
  await connectDb();
  const r = await ManualTopupRequest.findById(id).select('screenshotKey').lean();
  if (!r?.screenshotKey) throw AppError.notFound('No payment screenshot for this request');
  const mimeType = r.screenshotKey.endsWith('.png') ? 'image/png' : 'image/jpeg';
  return { buffer: await storage.getPrivate(r.screenshotKey), mimeType };
}

export async function approveTopup(id: string, input: { amountPaise?: number; note?: string }, actor: Actor) {
  const entry = await withTransaction(async (session) => {
    // Claim the request atomically: only a PENDING request can be approved, so two admins clicking
    // Approve at the same time can't both credit it (the second sees ALREADY_REVIEWED). Everything
    // below runs in the same transaction, so any failure rolls the claim back to PENDING.
    const reviewedAt = new Date();
    const before = await ManualTopupRequest.findOneAndUpdate(
      { _id: id, status: 'PENDING' },
      { $set: { status: 'APPROVED', reviewedById: actor.id, reviewedAt, reviewNote: input.note ?? null } },
      { session, new: false },
    ).lean();
    if (!before) {
      const exists = await ManualTopupRequest.exists({ _id: id }).session(session);
      if (!exists) throw AppError.notFound('Request not found');
      throw new AppError(409, 'ALREADY_REVIEWED', 'This request has already been reviewed.');
    }
    const creditPaise = input.amountPaise ?? before.amountPaise;
    if (creditPaise < env.WALLET_TOPUP_MIN_PAISE || creditPaise > env.WALLET_TOPUP_MAX_PAISE) {
      throw AppError.badRequest('Credited amount is outside the allowed range');
    }
    // Credit exactly once — idempotency key manual:<id> makes a double-approve a no-op.
    const tx1 = await postLedgerEntry(session, {
      userId: before.userId,
      type: 'TOPUP',
      direction: 'CREDIT',
      amountPaise: creditPaise,
      idempotencyKey: `manual:${id}`,
      referenceType: 'manual_topup',
      referenceId: id,
      description: 'Manual UPI top-up (approved)',
      createdById: actor.id,
    });
    await ManualTopupRequest.updateOne(
      { _id: id },
      { $set: { creditedAmountPaise: creditPaise, walletTransactionId: tx1.id } },
      { session },
    );
    return tx1;
  });
  await writeAudit({ actorUserId: actor.id, action: 'manual_topup.approve', entityType: 'manual_topup', entityId: id, requestId: actor.requestId, ip: actor.ip, after: { walletTransactionId: entry.id, amountPaise: Number(entry.amountPaise) } });
  return { id, walletTransactionId: entry.id, creditedAmountPaise: Number(entry.amountPaise), balanceAfterPaise: Number(entry.balanceAfterPaise) };
}

export async function rejectTopup(id: string, input: { reason: string }, actor: Actor) {
  await connectDb();
  // Atomic: only a still-PENDING request can be rejected (never one that was just approved).
  const r = await ManualTopupRequest.findOneAndUpdate(
    { _id: id, status: 'PENDING' },
    { $set: { status: 'REJECTED', reviewedById: actor.id, reviewedAt: new Date(), reviewNote: input.reason } },
  ).lean();
  if (!r) {
    if (!(await ManualTopupRequest.exists({ _id: id }))) throw AppError.notFound('Request not found');
    throw new AppError(409, 'ALREADY_REVIEWED', 'This request has already been reviewed.');
  }
  await writeAudit({ actorUserId: actor.id, action: 'manual_topup.reject', entityType: 'manual_topup', entityId: id, requestId: actor.requestId, ip: actor.ip, after: { reason: input.reason } });
  return { id, status: 'REJECTED' as const };
}

function mapRequest(r: {
  _id: string; amountPaise: number; utrNumber: string; note?: string | null; status: string;
  reviewNote?: string | null; creditedAmountPaise?: number | null; createdAt: Date; reviewedAt?: Date | null;
}) {
  return {
    id: r._id,
    amountPaise: Number(r.amountPaise),
    utrNumber: r.utrNumber,
    note: r.note ?? null,
    status: r.status,
    reviewNote: r.reviewNote ?? null,
    creditedAmountPaise: r.creditedAmountPaise != null ? Number(r.creditedAmountPaise) : null,
    createdAt: r.createdAt,
    reviewedAt: r.reviewedAt ?? null,
  };
}

function isUnique(e: unknown): boolean {
  return (duplicateKeyFields(e) ?? []).includes('utrNumber');
}
