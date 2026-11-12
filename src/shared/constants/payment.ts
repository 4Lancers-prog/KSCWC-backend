// payment.ts — payment order + event states.
export const PAYMENT_ORDER_STATUSES = [
  'CREATED',
  'AUTHORIZED',
  'CAPTURED',
  'FAILED',
  'REFUNDED',
] as const;
export type PaymentOrderStatus = (typeof PAYMENT_ORDER_STATUSES)[number];
