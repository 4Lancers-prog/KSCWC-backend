// wallet.ts — wallet transaction type/direction/status enums.
export const WALLET_TX_TYPES = [
  'TOPUP',
  'CARD_CHARGE',
  'REFUND',
  'ADMIN_CREDIT',
  'ADMIN_DEBIT',
  'REVERSAL',
] as const;
export type WalletTxType = (typeof WALLET_TX_TYPES)[number];

export const WALLET_DIRECTIONS = ['CREDIT', 'DEBIT'] as const;
export type WalletTxDirection = (typeof WALLET_DIRECTIONS)[number];

export const WALLET_TX_STATUSES = ['PENDING', 'POSTED', 'FAILED', 'REVERSED'] as const;
export type WalletTxStatus = (typeof WALLET_TX_STATUSES)[number];

// which types credit vs debit the balance
export const CREDIT_TYPES: WalletTxType[] = ['TOPUP', 'REFUND', 'ADMIN_CREDIT', 'REVERSAL'];
export const DEBIT_TYPES: WalletTxType[] = ['CARD_CHARGE', 'ADMIN_DEBIT'];
