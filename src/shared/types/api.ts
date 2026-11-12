// api.ts — API contract shared with the frontend (MIRROR of frontend src/types/api.ts).
import type { Role } from '../constants/roles';
import type { AccountStatus } from '../constants/account-status';

export interface FieldError {
  field: string;
  message: string;
}

export interface ApiError {
  code: string;
  message: string;
  fieldErrors?: FieldError[];
  requestId?: string;
}

export interface Paginated<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface SessionUser {
  id: string;
  fullName: string;
  phone: string;
  email: string | null;
  role: Role;
  accountStatus: AccountStatus;
  centreName: string | null;
  cscId: string | null;
  mfaEnabled: boolean;
}
