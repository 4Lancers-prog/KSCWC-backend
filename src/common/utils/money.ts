// money.ts — integer-paise helpers. Never use floating point for money math.

/** Add paise values safely (BigInt in, number out — callers keep totals in paise). */
export function sumPaise(values: Array<number | bigint>): number {
  return values.reduce<number>((acc, v) => acc + Number(v), 0);
}

/** Plain rupee string without a currency symbol (e.g. for CSV): 500 → "5.00". */
export function formatPaisePlain(paise: number | bigint): string {
  const n = Number(paise);
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

export const rupeesToPaise = (rupees: number): number => Math.round(rupees * 100);
