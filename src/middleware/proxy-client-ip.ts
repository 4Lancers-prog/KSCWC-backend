// proxy-client-ip.ts — trust the visitor IP forwarded by OUR Cloudflare Worker, and nobody else.
// The Worker adds x-kscwc-proxy-secret (shared secret) + x-kscwc-client-ip (Cloudflare's
// CF-Connecting-IP). Only when the secret matches do we use that IP as req.ip; the headers are
// always stripped so they can't leak further or be spoofed by someone calling the API directly.
import { timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
import type { Request, Response, NextFunction } from 'express';
import { env } from '../config/env';

const SECRET_HEADER = 'x-kscwc-proxy-secret';
const IP_HEADER = 'x-kscwc-client-ip';

function secretMatches(given: string | undefined): boolean {
  if (!env.PROXY_SHARED_SECRET || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(env.PROXY_SHARED_SECRET);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function proxyClientIp(req: Request, _res: Response, next: NextFunction): void {
  const given = req.headers[SECRET_HEADER];
  const ip = req.headers[IP_HEADER];
  if (secretMatches(typeof given === 'string' ? given : undefined) && typeof ip === 'string' && isIP(ip)) {
    Object.defineProperty(req, 'ip', { value: ip, configurable: true, enumerable: true });
  }
  delete req.headers[SECRET_HEADER];
  delete req.headers[IP_HEADER];
  next();
}
