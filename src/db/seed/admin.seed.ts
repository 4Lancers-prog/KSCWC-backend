// admin.seed.ts — create the initial SUPER_ADMIN securely (no credentials committed).
// Reads SEED_ADMIN_PHONE / SEED_ADMIN_PASSWORD from the environment. If the password is
// missing in a non-production run, a strong one is generated and printed once.
import crypto from 'node:crypto';
import argon2 from 'argon2';
import { User, WalletAccount } from '../models';
import { withTransaction } from '../../lib/db';
import { normalizePhone } from '../../common/utils/normalize';
import { isProd } from '../../config/env';

export async function seedAdmin(): Promise<void> {
  const phoneRaw = process.env.SEED_ADMIN_PHONE ?? '9000000000';
  const phone = normalizePhone(phoneRaw);
  let password = process.env.SEED_ADMIN_PASSWORD ?? '';

  if (!password) {
    if (isProd) {
      // eslint-disable-next-line no-console
      console.error('✖ SEED_ADMIN_PASSWORD is required in production; skipping admin seed.');
      return;
    }
    password = crypto.randomBytes(12).toString('base64url');
    // eslint-disable-next-line no-console
    console.log(`\n⚠ Generated dev SUPER_ADMIN credentials:\n  phone: ${phone}\n  password: ${password}\n`);
  }

  const existing = await User.exists({ phoneNormalized: phone });
  if (existing) {
    // eslint-disable-next-line no-console
    console.log('✔ admin already exists; not modified');
    return;
  }

  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
  await withTransaction(async (session) => {
    const [admin] = await User.create(
      [{ fullName: 'System Administrator', phoneNormalized: phone, passwordHash, role: 'SUPER_ADMIN', accountStatus: 'ACTIVE', approvedAt: new Date() }],
      { session },
    );
    await WalletAccount.create([{ userId: admin!._id }], { session });
  });
  // eslint-disable-next-line no-console
  console.log('✔ created SUPER_ADMIN');
}
