// roles.ts — user roles (single source of truth; mirror of frontend).
export const ROLES = ['USER', 'ADMIN', 'SUPER_ADMIN', 'SUPPORT'] as const;
export type Role = (typeof ROLES)[number];

export const isAdminRole = (role: Role): boolean => role === 'ADMIN' || role === 'SUPER_ADMIN';
export const isStaffRole = (role: Role): boolean => role !== 'USER';
