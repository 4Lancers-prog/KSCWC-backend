// fid.service.ts — FID generation with exact ₹5-once charging (BPD 6.5 / AC-09).
// Flow: reserve (debit ₹5) + create PROCESSING row in ONE tx → render PDF → on success mark
// SUCCEEDED; on failure post a compensating REFUND (net zero) and mark FAILED. Re-download is
// free. Same idempotency key never charges twice.
import { prisma } from '../../lib/prisma';
import { env } from '../../config/env';
import { AppError } from '../../common/errors/app-error';
import { FID_TEMPLATE_VERSION } from '../../config/constants';
import { cleanText } from '../../common/utils/normalize';
import { resolvePage, paginate } from '../../common/utils/pagination';
import { postLedgerEntry } from '../wallet/wallet-ledger.service';
import { writeAudit } from '../audit/audit.service';
import * as storage from '../../lib/storage';
import { renderFidPdf, type FidCardData } from './fid-pdf.renderer';
import * as repo from './fid.repository';
import type { FidGenerateInput } from '../../shared/schemas/fid.schema';

export interface Actor {
  id: string;
  requestId?: string;
  ip?: string | null;
}

// Renderer is injectable so tests can simulate success/failure without launching Chromium.
export type RenderFn = (data: FidCardData) => Promise<Buffer>;

function summarize(g: {
  id: string;
  status: string;
  chargePaise: bigint | number;
  createdAt: Date;
  completedAt: Date | null;
}) {
  return {
    id: g.id,
    status: g.status,
    chargePaise: Number(g.chargePaise),
    createdAt: g.createdAt,
    completedAt: g.completedAt,
    downloadUrl: g.status === 'SUCCEEDED' ? `/api/v1/fid-generations/${g.id}/download` : null,
  };
}

/** Validate an optional photo data URL by content (magic bytes), size and type. */
function validatePhoto(input: string): string {
  const m = /^data:(image\/(png|jpeg));base64,([A-Za-z0-9+/=]+)$/.exec(input.trim());
  if (!m) throw AppError.badRequest('Photo must be a PNG or JPEG image', [{ field: 'photoBase64', message: 'Invalid image' }]);
  const buf = Buffer.from(m[3]!, 'base64');
  if (buf.length > 1_000_000) throw AppError.badRequest('Photo must be 1MB or smaller');
  const isPng = buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
  const isJpg = buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  if (!isPng && !isJpg) throw AppError.badRequest('Photo content is not a valid image');
  return input.trim();
}

export async function generateFid(
  actor: Actor,
  input: FidGenerateInput,
  idempotencyKey: string,
  render: RenderFn = renderFidPdf,
) {
  // Idempotent replay: same key → same attempt, no new charge.
  const prior = await repo.findByIdempotencyKey(idempotencyKey);
  if (prior) {
    if (prior.userId !== actor.id) throw AppError.notFound('Not found');
    return summarize(prior);
  }

  const photoDataUrl = input.photoBase64 ? validatePhoto(input.photoBase64) : null;
  const price = env.FID_GENERATION_PRICE_PAISE;

  // 1) Reserve: create the generation row and debit ₹5 atomically.
  //    If balance < ₹5, the whole transaction rolls back (no row, no charge).
  const gen = await prisma.$transaction(async (tx) => {
    const g = await tx.fidGeneration.create({
      data: {
        userId: actor.id,
        customerId: input.customerId ?? null,
        templateVersion: FID_TEMPLATE_VERSION,
        idempotencyKey,
        status: 'PROCESSING',
        chargePaise: BigInt(price),
      },
    });
    const charge = await postLedgerEntry(tx, {
      userId: actor.id,
      type: 'CARD_CHARGE',
      direction: 'DEBIT',
      amountPaise: price,
      idempotencyKey: `fidcharge:${g.id}`,
      referenceType: 'fid_generation',
      referenceId: g.id,
      description: 'FID card generation',
      createdById: actor.id,
    });
    return tx.fidGeneration.update({ where: { id: g.id }, data: { walletTransactionId: charge.id } });
  });

  // 2) Render + store OUTSIDE the charge transaction.
  try {
    const pdf = await render({
      farmerName: cleanText(input.farmerName),
      gender: input.gender,
      fidNumber: input.fidNumber.trim(),
      address: input.address.trim(),
      maskedAadhaar: input.maskedAadhaar ?? null,
      photoDataUrl,
    });
    if (!pdf || pdf.length === 0) throw new Error('empty pdf');
    const key = `fid/${gen.id}.pdf`;
    await storage.putPrivate(key, pdf, 'application/pdf');
    const done = await repo.markSucceeded(gen.id, key);
    await writeAudit({
      actorUserId: actor.id,
      action: 'fid.generated',
      entityType: 'fid_generation',
      entityId: gen.id,
      requestId: actor.requestId,
      ip: actor.ip,
      after: { chargePaise: price },
    });
    return summarize(done);
  } catch (err) {
    // 3) Compensating refund (immutable ledger → new REFUND entry) + mark FAILED. Net charge zero.
    await prisma.$transaction((tx) =>
      postLedgerEntry(tx, {
        userId: actor.id,
        type: 'REFUND',
        direction: 'CREDIT',
        amountPaise: price,
        idempotencyKey: `fidrefund:${gen.id}`,
        referenceType: 'fid_generation',
        referenceId: gen.id,
        description: 'FID generation failed — refund',
      }),
    );
    await repo.markFailed(gen.id, 'RENDER_FAILED');
    await writeAudit({
      actorUserId: actor.id,
      action: 'fid.failed_refunded',
      entityType: 'fid_generation',
      entityId: gen.id,
      requestId: actor.requestId,
      ip: actor.ip,
    });
    throw new AppError(502, 'FID_RENDER_FAILED', 'Could not generate the card. You were not charged.');
  }
}

export async function getGeneration(id: string, userId: string) {
  const g = await repo.findById(id);
  if (!g || g.userId !== userId) throw AppError.notFound('Not found');
  return summarize(g);
}

export async function listGenerations(userId: string, page: { page?: number; limit?: number }) {
  const p = resolvePage(page.page, page.limit);
  const { items, total } = await repo.listForUser(userId, p);
  return paginate(items.map(summarize), total, p);
}

/** Returns the stored PDF for an owner. Free — downloading again never charges. */
export async function getDownload(id: string, userId: string): Promise<Buffer> {
  const g = await repo.findById(id);
  if (!g || g.userId !== userId) throw AppError.notFound('Not found');
  if (g.status !== 'SUCCEEDED' || !g.fileKey) throw AppError.badRequest('Card is not ready');
  return storage.getPrivate(g.fileKey);
}

// ── Official FID portal link (admin-editable) ──
const FID_PORTAL_KEY = 'fid_portal_url';
const DEFAULT_FID_PORTAL_URL = 'https://kkisan.karnataka.gov.in/Citizen/FarmServiceFIDDetails.aspx?AID=FM';

export async function getFidPortalUrl(): Promise<{ url: string }> {
  const s = await prisma.systemSetting.findUnique({ where: { key: FID_PORTAL_KEY } });
  const stored = (s?.value as { url?: string } | undefined)?.url;
  return { url: stored || DEFAULT_FID_PORTAL_URL };
}

export async function setFidPortalUrl(url: string, actor: Actor): Promise<{ url: string }> {
  await prisma.systemSetting.upsert({
    where: { key: FID_PORTAL_KEY },
    create: { key: FID_PORTAL_KEY, value: { url }, updatedById: actor.id },
    update: { value: { url }, updatedById: actor.id },
  });
  await writeAudit({
    actorUserId: actor.id,
    action: 'fid_portal_url.update',
    entityType: 'system_setting',
    entityId: FID_PORTAL_KEY,
    requestId: actor.requestId,
    ip: actor.ip,
    after: { url },
  });
  return { url };
}
