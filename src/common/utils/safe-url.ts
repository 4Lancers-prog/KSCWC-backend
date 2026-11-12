// safe-url.ts — URL/scheme allowlisting and safe YouTube embed conversion.
// Blocks javascript:, data:, file: and anything that is not an https URL.

const BLOCKED_SCHEMES = ['javascript:', 'data:', 'file:', 'vbscript:'];

export function isSafeHttpsUrl(raw: string): boolean {
  try {
    const u = new URL(raw.trim());
    if (BLOCKED_SCHEMES.includes(u.protocol)) return false;
    return u.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Parse a YouTube URL and return a safe embed URL, or null if it is not a recognised
 * YouTube video link. Only youtube.com / youtu.be hosts are accepted.
 */
export function toYouTubeEmbed(raw: string): string | null {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  if (u.protocol !== 'https:') return null;
  const host = u.hostname.replace(/^www\./, '').toLowerCase();
  let id: string | null = null;

  if (host === 'youtu.be') {
    id = u.pathname.slice(1);
  } else if (host === 'youtube.com' || host === 'm.youtube.com') {
    if (u.pathname === '/watch') id = u.searchParams.get('v');
    else if (u.pathname.startsWith('/embed/')) id = u.pathname.split('/')[2] ?? null;
    else if (u.pathname.startsWith('/shorts/')) id = u.pathname.split('/')[2] ?? null;
  }
  if (!id || !/^[A-Za-z0-9_-]{6,20}$/.test(id)) return null;
  return `https://www.youtube.com/embed/${id}`;
}
