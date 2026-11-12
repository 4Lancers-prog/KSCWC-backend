// fid.render.test.ts — the real Chromium renderer produces a valid PDF (AC-10, partial).
// Visual 6x4in / 85.6x54mm verification is done by print preview during UAT; here we assert a
// non-empty, well-formed PDF is produced. Requires Playwright's chromium (npx playwright install chromium).
import { describe, it, expect } from 'vitest';
import { renderFidPdf } from '../../modules/fid/fid-pdf.renderer';

describe('FID PDF renderer', () => {
  it('renders a valid, non-empty PDF with Kannada + long address', async () => {
    const pdf = await renderFidPdf({
      farmerName: 'ಬಸವರಾಜ ಹೆಗಡೆ',
      gender: 'MALE',
      fidNumber: 'FID-2026-000123',
      address: 'ನಂ. 42, ೫ನೇ ಅಡ್ಡರಸ್ತೆ, ಗಾಂಧಿನಗರ, ಬೆಂಗಳೂರು - ೫೬೦೦೦೯ ' + 'ಹೆಚ್ಚುವರಿ ವಿಳಾಸ ಸಾಲು',
      maskedAadhaar: '1234',
    });
    expect(Buffer.isBuffer(pdf)).toBe(true);
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(1000);
  }, 60_000);
});
