// safe-url.test.ts — YouTube embed conversion + https allowlist (AC-12).
import { describe, it, expect } from 'vitest';
import { isSafeHttpsUrl, toYouTubeEmbed } from '../../common/utils/safe-url';

describe('isSafeHttpsUrl', () => {
  it('accepts https, rejects everything else', () => {
    expect(isSafeHttpsUrl('https://karnataka.gov.in')).toBe(true);
    expect(isSafeHttpsUrl('http://insecure.example')).toBe(false);
    expect(isSafeHttpsUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeHttpsUrl('data:text/html,<script>')).toBe(false);
    expect(isSafeHttpsUrl('file:///etc/passwd')).toBe(false);
    expect(isSafeHttpsUrl('not a url')).toBe(false);
  });
});

describe('toYouTubeEmbed', () => {
  it('converts watch / youtu.be / shorts to a safe embed url', () => {
    expect(toYouTubeEmbed('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('https://www.youtube.com/embed/dQw4w9WgXcQ');
    expect(toYouTubeEmbed('https://youtu.be/dQw4w9WgXcQ')).toBe('https://www.youtube.com/embed/dQw4w9WgXcQ');
    expect(toYouTubeEmbed('https://www.youtube.com/shorts/dQw4w9WgXcQ')).toBe('https://www.youtube.com/embed/dQw4w9WgXcQ');
  });
  it('rejects non-YouTube or unsafe urls', () => {
    expect(toYouTubeEmbed('https://vimeo.com/123')).toBeNull();
    expect(toYouTubeEmbed('javascript:alert(1)')).toBeNull();
    expect(toYouTubeEmbed('https://youtube.com/watch?v=<script>')).toBeNull();
  });
});
