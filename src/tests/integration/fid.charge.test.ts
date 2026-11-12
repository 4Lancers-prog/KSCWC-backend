// fid.charge.test.ts — ₹5 charged once, re-download free, failed render refunds (AC-09).
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { prisma } from '../../lib/prisma';
import { resetDb, createUser } from '../helpers/test-db';
import { postLedgerEntry } from '../../modules/wallet/wallet-ledger.service';
import * as fid from '../../modules/fid/fid.service';
import type { FidGenerateInput } from '../../shared/schemas/fid.schema';

const INPUT: FidGenerateInput = {
  farmerName: 'ಸಿದ್ದಪ್ಪ',
  gender: 'MALE',
  fidNumber: 'FID-123',
  address: 'ಬೆಂಗಳೂರು',
};
const okRender = async () => Buffer.from('%PDF-1.4\n...stub...');
const failRender = async () => {
  throw new Error('render boom');
};
const balanceOf = async (userId: string) =>
  Number((await prisma.walletAccount.findUniqueOrThrow({ where: { userId } })).balancePaise);
const seed = (userId: string, paise: number) =>
  prisma.$transaction((tx) =>
    postLedgerEntry(tx, { userId, type: 'TOPUP', direction: 'CREDIT', amountPaise: paise, idempotencyKey: `seed:${userId}` }),
  );

beforeAll(() => {});
beforeEach(async () => {
  await resetDb();
});

describe('FID ₹5-once charging', () => {
  it('charges exactly ₹5 on success and re-download is free', async () => {
    const u = await createUser({ phone: '9600000001' });
    await seed(u.id, 10000);

    const gen = await fid.generateFid({ id: u.id }, INPUT, 'k-success', okRender);
    expect(gen.status).toBe('SUCCEEDED');
    expect(gen.chargePaise).toBe(500);
    expect(await balanceOf(u.id)).toBe(9500);

    // re-download: no additional charge
    const pdf = await fid.getDownload(gen.id, u.id);
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
    expect(await balanceOf(u.id)).toBe(9500);

    // only one CARD_CHARGE
    expect(await prisma.walletTransaction.count({ where: { userId: u.id, type: 'CARD_CHARGE' } })).toBe(1);
  });

  it('a retry with the same idempotency key does not charge again', async () => {
    const u = await createUser({ phone: '9600000002' });
    await seed(u.id, 10000);
    const first = await fid.generateFid({ id: u.id }, INPUT, 'k-same', okRender);
    const again = await fid.generateFid({ id: u.id }, INPUT, 'k-same', okRender);
    expect(again.id).toBe(first.id);
    expect(await balanceOf(u.id)).toBe(9500);
    expect(await prisma.fidGeneration.count({ where: { userId: u.id } })).toBe(1);
  });

  it('a failed render refunds — net charge is zero', async () => {
    const u = await createUser({ phone: '9600000003' });
    await seed(u.id, 1000);
    await expect(fid.generateFid({ id: u.id }, INPUT, 'k-fail', failRender)).rejects.toMatchObject({
      code: 'FID_RENDER_FAILED',
    });
    expect(await balanceOf(u.id)).toBe(1000); // debit 500 then refund 500
    const g = await prisma.fidGeneration.findFirstOrThrow({ where: { userId: u.id } });
    expect(g.status).toBe('FAILED');
    expect(await prisma.walletTransaction.count({ where: { userId: u.id, type: 'CARD_CHARGE' } })).toBe(1);
    expect(await prisma.walletTransaction.count({ where: { userId: u.id, type: 'REFUND' } })).toBe(1);
  });

  it('insufficient balance blocks generation with no charge and no row', async () => {
    const u = await createUser({ phone: '9600000004' });
    await seed(u.id, 400); // < ₹5
    await expect(fid.generateFid({ id: u.id }, INPUT, 'k-poor', okRender)).rejects.toMatchObject({
      code: 'INSUFFICIENT_FUNDS',
    });
    expect(await balanceOf(u.id)).toBe(400);
    expect(await prisma.fidGeneration.count({ where: { userId: u.id } })).toBe(0);
  });
});
