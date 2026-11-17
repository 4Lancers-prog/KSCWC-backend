// users.repository.ts — admin user listing + status updates.
import { User } from '../../db/models';
import { connectDb, containsRegex, toPlain } from '../../lib/db';
import { maskAadhaar, logoUrlFor } from '../../lib/identity';
import { skip, type PageParams } from '../../common/utils/pagination';
import type { AccountStatus } from '../../shared/constants/account-status';
import type { Role } from '../../shared/constants/roles';

export interface UserFilter {
  status?: AccountStatus;
  search?: string;
}

export interface SafeUser {
  id: string;
  fullName: string;
  phoneNormalized: string;
  emailNormalized: string | null;
  role: Role;
  accountStatus: AccountStatus;
  centreName: string | null;
  cscId: string | null;
  rejectedReason: string | null;
  approvedAt: Date | null;
  createdAt: Date;
  aadhaarMasked: string | null;
  panMasked: string | null;
  logoUrl: string | null;
}

const SAFE_SELECT = 'fullName phoneNormalized emailNormalized role accountStatus centreName cscId rejectedReason approvedAt createdAt updatedAt aadhaarLast4 panMasked logoKey';
const safe = (u: unknown): SafeUser | null => {
  if (!u) return null;
  const { aadhaarLast4, logoKey, updatedAt: _u, ...p } = toPlain<SafeUser & { aadhaarLast4?: string; logoKey?: string; updatedAt?: Date }>(u);
  return {
    ...p,
    emailNormalized: p.emailNormalized ?? null,
    aadhaarMasked: maskAadhaar(aadhaarLast4),
    panMasked: p.panMasked ?? null,
    logoUrl: logoUrlFor(p.id, logoKey),
  };
};

export async function listUsers(filter: UserFilter, page: PageParams) {
  await connectDb();
  const where: Record<string, unknown> = {
    ...(filter.status ? { accountStatus: filter.status } : {}),
    ...(filter.search
      ? {
          $or: [
            { fullName: containsRegex(filter.search) },
            { phoneNormalized: containsRegex(filter.search) },
            { centreName: containsRegex(filter.search) },
          ],
        }
      : {}),
  };
  const [items, total] = await Promise.all([
    User.find(where).select(SAFE_SELECT).sort({ createdAt: -1 }).skip(skip(page)).limit(page.limit).lean(),
    User.countDocuments(where),
  ]);
  return { items: items.map((u) => safe(u)!), total };
}

export async function findByIdSafe(id: string) {
  await connectDb();
  return safe(await User.findById(id).select(SAFE_SELECT).lean());
}

export async function findRaw(id: string) {
  await connectDb();
  return safe(await User.findById(id).select(SAFE_SELECT + ' approvedById').lean());
}

export async function updateStatus(
  id: string,
  data: {
    accountStatus: AccountStatus;
    approvedById?: string | null;
    approvedAt?: Date | null;
    rejectedReason?: string | null;
  },
) {
  await connectDb();
  const set = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));
  return safe(await User.findByIdAndUpdate(id, { $set: set }, { new: true }).select(SAFE_SELECT).lean());
}
