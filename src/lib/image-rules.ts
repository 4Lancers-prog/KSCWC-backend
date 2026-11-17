// image-rules.ts — accept only real PNG / JPG / WebP images (checked by content), up to 2 MB.
import { AppError } from '../common/errors/app-error';

export const IMAGE_MAX_BYTES = 2 * 1024 * 1024;
const RULES: Record<string, { ext: string; sniff: (b: Buffer) => boolean }> = {
  'image/png': { ext: 'png', sniff: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  'image/jpeg': { ext: 'jpg', sniff: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  'image/webp': { ext: 'webp', sniff: (b) => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP' },
};

export function checkImage(file: { buffer: Buffer; mimetype: string; size: number } | undefined, what = 'Image') {
  if (!file) throw AppError.badRequest(`Choose an image file`);
  const rule = RULES[file.mimetype];
  if (!rule) throw AppError.badRequest(`${what}: only PNG, JPG or WebP images are allowed`);
  if (file.size > IMAGE_MAX_BYTES) throw AppError.badRequest(`${what} must be 2 MB or smaller`);
  if (!rule.sniff(file.buffer)) throw AppError.badRequest(`${what}: the file is not a real image`);
  return { ext: rule.ext, mime: file.mimetype };
}
