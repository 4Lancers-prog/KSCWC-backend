// fid-pdf.renderer.ts — deterministic server-side PDF via headless Chromium (Playwright).
// Output: 6in × 4in landscape page with ONE 85.6 × 54 mm card centred for print.
// Kannada renders correctly because Chromium shapes complex scripts; for guaranteed, portable
// output we embed a Kannada font (if present at assets/fonts) as base64 so there is no network
// dependency at render time. All user text is HTML-escaped before templating (no injection).
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { FID_TEMPLATE_VERSION } from '../../config/constants';

export interface FidCardData {
  farmerName: string;
  gender: string;
  fidNumber: string;
  address: string;
  maskedAadhaar?: string | null;
  photoDataUrl?: string | null;
}

const DISCLAIMER =
  'User-generated FID information card — not an official government-issued identity document.';

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

let fontCss: string | null = null;
async function loadFontCss(): Promise<string> {
  if (fontCss !== null) return fontCss;
  // Look for a bundled Kannada TTF; if absent, fall back to system fonts (no @font-face).
  const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../assets/fonts');
  const candidates = ['NotoSansKannada-Regular.ttf', 'NotoSansKannada.ttf'];
  for (const name of candidates) {
    try {
      const buf = await fs.readFile(path.join(dir, name));
      const b64 = buf.toString('base64');
      fontCss = `@font-face{font-family:'KannadaEmbed';src:url(data:font/ttf;base64,${b64}) format('truetype');font-weight:400 700;}`;
      return fontCss;
    } catch {
      /* try next */
    }
  }
  fontCss = '';
  return fontCss;
}

function buildHtml(data: FidCardData, embeddedFont: string): string {
  const family = embeddedFont
    ? `'KannadaEmbed', 'Noto Sans Kannada', sans-serif`
    : `'Noto Sans Kannada', 'Tunga', sans-serif`;
  const photo = data.photoDataUrl
    ? `<img class="photo" src="${data.photoDataUrl}" alt="" />`
    : `<div class="photo placeholder">ಫೋಟೋ</div>`;
  return `<!doctype html><html><head><meta charset="utf-8" />
<style>
  ${embeddedFont}
  @page { size: 6in 4in; margin: 0; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  html, body { margin: 0; padding: 0; font-family: ${family}; }
  .sheet { width: 6in; height: 4in; display: flex; align-items: center; justify-content: center; background: #ffffff; }
  .card {
    width: 85.6mm; height: 54mm; border-radius: 3mm; overflow: hidden;
    border: 0.4mm solid #0b2340; display: flex; flex-direction: column;
    box-shadow: 0 0 0 0.2mm #d99b00; background: #ffffff;
  }
  .card .bar { background: #0b2340; color: #fff; padding: 1.6mm 2.4mm; display: flex; align-items: center; gap: 2mm; }
  .card .bar .seal { width: 7mm; height: 7mm; border-radius: 50%; background: #0b2340; border: 0.5mm solid #d99b00;
    color: #f7cf5a; font-weight: 700; display: flex; align-items: center; justify-content: center; font-size: 4.5mm; }
  .card .bar .title { font-size: 2.6mm; line-height: 1.2; }
  .card .bar .title b { font-size: 3mm; }
  .card .body { flex: 1; display: flex; padding: 2.2mm 2.4mm; gap: 2.4mm; }
  .card .fields { flex: 1; display: flex; flex-direction: column; gap: 1mm; }
  .row { font-size: 2.7mm; color: #0f172a; }
  .row .k { color: #475569; font-size: 2.3mm; }
  .card .photo { width: 20mm; height: 25mm; object-fit: cover; border: 0.3mm solid #cbd5e1; border-radius: 1mm; }
  .card .photo.placeholder { display: flex; align-items: center; justify-content: center; color: #94a3b8; font-size: 2.4mm; background: #f1f5f9; }
  .card .foot { background: #f4f7fb; border-top: 0.3mm solid #d99b00; padding: 1.2mm 2.4mm; font-size: 1.9mm; color: #475569; }
</style></head><body>
  <div class="sheet"><div class="card">
    <div class="bar">
      <div class="seal">ಕ</div>
      <div class="title"><b>ಕೆಎಸ್‌ಸಿಡಬ್ಲ್ಯೂಸಿ</b><br/>FID Information Card</div>
    </div>
    <div class="body">
      <div class="fields">
        <div class="row"><span class="k">ಹೆಸರು / Name:</span> <b>${esc(data.farmerName)}</b></div>
        <div class="row"><span class="k">ಲಿಂಗ / Gender:</span> ${esc(data.gender)}</div>
        <div class="row"><span class="k">ಎಫ್‌ಐಡಿ / FID No:</span> <b>${esc(data.fidNumber)}</b></div>
        <div class="row"><span class="k">ವಿಳಾಸ / Address:</span> ${esc(data.address)}</div>
        ${data.maskedAadhaar ? `<div class="row"><span class="k">Aadhaar:</span> XXXX XXXX ${esc(data.maskedAadhaar)}</div>` : ''}
      </div>
      ${photo}
    </div>
    <div class="foot">${esc(DISCLAIMER)}</div>
  </div></div>
</body></html>`;
}

export async function renderFidPdf(data: FidCardData): Promise<Buffer> {
  const embeddedFont = await loadFontCss();
  const html = buildHtml(data, embeddedFont);
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'load' });
    const pdf = await page.pdf({
      width: '6in',
      height: '4in',
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
    });
    return pdf;
  } finally {
    await browser.close();
  }
}

export const TEMPLATE_VERSION = FID_TEMPLATE_VERSION;
