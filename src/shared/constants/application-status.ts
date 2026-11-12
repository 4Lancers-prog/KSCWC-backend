// application-status.ts — generic application/ticket states, grouped per form.
export const INSURANCE_STATUSES = [
  'SUBMITTED',
  'UNDER_REVIEW',
  'NEEDS_INFORMATION',
  'APPROVED',
  'REJECTED',
  'COMPLETED',
] as const;

export const MEMBERSHIP_STATUSES = ['SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED'] as const;

export const TRAINING_STATUSES = ['REGISTERED', 'CONFIRMED', 'ATTENDED', 'CANCELLED'] as const;

export const GRIEVANCE_STATUSES = [
  'OPEN',
  'IN_PROGRESS',
  'WAITING_FOR_USER',
  'RESOLVED',
  'CLOSED',
] as const;

export type ApplicationStatus =
  | (typeof INSURANCE_STATUSES)[number]
  | (typeof MEMBERSHIP_STATUSES)[number]
  | (typeof TRAINING_STATUSES)[number]
  | (typeof GRIEVANCE_STATUSES)[number];
