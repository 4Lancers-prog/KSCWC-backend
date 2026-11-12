// permissions.ts — role → permission matrix and helpers (server-side RBAC).
import type { Role } from '../shared/constants/roles';

export const PERMISSIONS = [
  // user approvals & accounts
  'users:read',
  'users:approve',
  'users:suspend',
  // services
  'services:manage',
  // customers (admin cross-user)
  'customers:read:all',
  // reports
  'reports:read:all',
  // wallet administration
  'wallet:read:all',
  'wallet:adjust',
  // content
  'content:manage',
  'committees:manage',
  'links:manage',
  'documents:manage',
  // applications
  'applications:manage',
  // audit
  'audit:read',
  // system settings / pricing
  'settings:manage',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const ALL: Permission[] = [...PERMISSIONS];

const ADMIN: Permission[] = [
  'users:read',
  'users:approve',
  'users:suspend',
  'services:manage',
  'customers:read:all',
  'reports:read:all',
  'wallet:read:all',
  'wallet:adjust',
  'content:manage',
  'committees:manage',
  'links:manage',
  'documents:manage',
  'applications:manage',
  'audit:read',
];

const SUPPORT: Permission[] = [
  'users:read',
  'customers:read:all',
  'reports:read:all',
  'wallet:read:all',
  'audit:read',
];

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  SUPER_ADMIN: ALL,
  ADMIN,
  SUPPORT, // read-only auditor: no wallet adjust, no deletes
  USER: [],
};

export const roleHas = (role: Role, permission: Permission): boolean =>
  ROLE_PERMISSIONS[role].includes(permission);
