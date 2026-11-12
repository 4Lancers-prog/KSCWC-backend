// normalize.test.ts — phone/email normalisation (no DB).
import { describe, it, expect } from 'vitest';
import { normalizePhone, normalizeEmail, cleanText } from '../../common/utils/normalize';

describe('normalizePhone', () => {
  it('keeps a plain 10-digit number', () => {
    expect(normalizePhone('9876543210')).toBe('9876543210');
  });
  it('strips +91 / 91 country code', () => {
    expect(normalizePhone('+91 98765 43210')).toBe('9876543210');
    expect(normalizePhone('919876543210')).toBe('9876543210');
  });
  it('strips a leading 0', () => {
    expect(normalizePhone('09876543210')).toBe('9876543210');
  });
});

describe('normalizeEmail', () => {
  it('lowercases and trims; empty → null', () => {
    expect(normalizeEmail('  Foo@Bar.COM ')).toBe('foo@bar.com');
    expect(normalizeEmail('')).toBeNull();
    expect(normalizeEmail(null)).toBeNull();
  });
});

describe('cleanText', () => {
  it('collapses whitespace', () => {
    expect(cleanText('  ರಾಮ   ಕುಮಾರ ')).toBe('ರಾಮ ಕುಮಾರ');
  });
});
