// types.ts — Express request augmentation for the authenticated user + request id.
import type { Role } from '../shared/constants/roles';
import type { AccountStatus } from '../shared/constants/account-status';

export interface AuthUser {
  id: string;
  role: Role;
  accountStatus: AccountStatus;
  fullName: string;
  phone: string;
  email: string | null;
  centreName: string | null;
  cscId: string | null;
  mfaEnabled: boolean;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
      requestId: string;
      /** Set when an operator's login was taken over by another device or ended by an admin. */
      sessionEnded?: boolean;
    }
  }
}

export {};
