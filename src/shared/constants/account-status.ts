// account-status.ts — user account lifecycle states + allowed transitions.
export const ACCOUNT_STATUSES = ['PENDING_APPROVAL', 'ACTIVE', 'REJECTED', 'SUSPENDED'] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

// actor transition map (server-enforced)
export const ACCOUNT_TRANSITIONS: Record<AccountStatus, AccountStatus[]> = {
  PENDING_APPROVAL: ['ACTIVE', 'REJECTED'],
  ACTIVE: ['SUSPENDED'],
  SUSPENDED: ['ACTIVE'],
  REJECTED: [],
};

export const canTransitionAccount = (from: AccountStatus, to: AccountStatus): boolean =>
  ACCOUNT_TRANSITIONS[from].includes(to);
