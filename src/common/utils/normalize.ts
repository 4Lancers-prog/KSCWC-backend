// normalize.ts — phone/email normalisation and safe-text helpers.

/** Normalise an Indian mobile to the last 10 digits (store country code separately if needed). */
export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  // strip a leading 91 country code if present and length is 12
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1);
  return digits.slice(-10);
}

export function normalizeEmail(raw?: string | null): string | null {
  if (!raw) return null;
  const e = raw.trim().toLowerCase();
  return e.length ? e : null;
}

/** Collapse internal whitespace and trim. */
export function cleanText(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim();
}
