// identity.test.ts — Aadhaar (Verhoeff) + PAN validation, encryption round-trip, masking.
import { describe, it, expect } from 'vitest';
import { aadhaarSchema, panSchema, verhoeffValid, encrypt, decrypt, protectAadhaar, protectPan, maskAadhaar } from '../../lib/identity';

// build a valid Aadhaar: 11 digits + Verhoeff check digit
function withCheckDigit(first11: string) {
  for (let d = 0; d <= 9; d++) if (verhoeffValid(first11 + d)) return first11 + d;
  throw new Error('no check digit');
}
const VALID = withCheckDigit('23456789012');

describe('Aadhaar validation', () => {
  it('accepts a correct number, with or without spaces', () => {
    expect(aadhaarSchema.parse(VALID)).toBe(VALID);
    expect(aadhaarSchema.parse(`${VALID.slice(0, 4)} ${VALID.slice(4, 8)} ${VALID.slice(8)}`)).toBe(VALID);
  });
  it('rejects a single mistyped digit and swapped digits (checksum)', () => {
    const typo = VALID.slice(0, 5) + ((Number(VALID[5]) + 1) % 10) + VALID.slice(6);
    expect(aadhaarSchema.safeParse(typo).success).toBe(false);
    const swapped = VALID.slice(0, 2) + VALID[3] + VALID[2] + VALID.slice(4);
    if (swapped !== VALID) expect(aadhaarSchema.safeParse(swapped).success).toBe(false);
  });
  it('rejects wrong length, letters, and numbers starting with 0 or 1', () => {
    for (const bad of ['12345', 'abcd12345678', '0' + VALID.slice(1), '1' + VALID.slice(1), VALID + '1']) {
      expect(aadhaarSchema.safeParse(bad).success, bad).toBe(false);
    }
  });
});

describe('PAN validation', () => {
  it('accepts valid PANs (any case, spaces trimmed)', () => {
    expect(panSchema.parse('abcpe1234f')).toBe('ABCPE1234F');
    expect(panSchema.parse(' AAACR5055K ')).toBe('AAACR5055K');
  });
  it('rejects bad formats and invalid holder type', () => {
    for (const bad of ['ABCDE1234', 'ABCDE12345', '12345ABCDE', 'ABCQE1234F', 'ABCP11234F']) {
      expect(panSchema.safeParse(bad).success, bad).toBe(false);
    }
  });
});

describe('protection', () => {
  it('encrypts (different every time), decrypts, masks, fingerprints consistently', () => {
    const a = encrypt(VALID); const b = encrypt(VALID);
    expect(a).not.toBe(b);
    expect(a).not.toContain(VALID);
    expect(decrypt(a)).toBe(VALID);
    expect(protectAadhaar(VALID).aadhaarHash).toBe(protectAadhaar(VALID).aadhaarHash);
    expect(maskAadhaar(protectAadhaar(VALID).aadhaarLast4)).toBe(`XXXX XXXX ${VALID.slice(-4)}`);
    expect(protectPan('ABCPE1234F').panMasked).toBe('ABCXXXX34F');
  });
});
