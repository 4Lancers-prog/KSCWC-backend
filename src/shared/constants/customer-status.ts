// customer-status.ts — customer record states + allowed transitions.
export const CUSTOMER_STATUSES = ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'] as const;
export type CustomerStatus = (typeof CUSTOMER_STATUSES)[number];

export const CUSTOMER_TRANSITIONS: Record<CustomerStatus, CustomerStatus[]> = {
  PENDING: ['IN_PROGRESS', 'COMPLETED', 'CANCELLED'],
  IN_PROGRESS: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
};

export const canTransitionCustomer = (from: CustomerStatus, to: CustomerStatus): boolean =>
  from === to || CUSTOMER_TRANSITIONS[from].includes(to);
