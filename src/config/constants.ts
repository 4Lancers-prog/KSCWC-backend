// constants.ts — server-side constants (cookie/session names, TTLs, limits).
export const SESSION_COOKIE_NAME = 'kscwc.sid';
export const SESSION_TTL_MS = 1000 * 60 * 60 * 8; // 8 hours
export const CSRF_COOKIE_NAME = 'kscwc.csrf';
export const CSRF_HEADER_NAME = 'x-csrf-token';

export const PASSWORD_RESET_TTL_MS = 1000 * 60 * 30; // 30 minutes
export const LOGIN_RATE_MAX = 10; // attempts per window
export const LOGIN_RATE_WINDOW_MS = 1000 * 60 * 15; // 15 minutes
export const GLOBAL_RATE_MAX = 300;
export const GLOBAL_RATE_WINDOW_MS = 1000 * 60; // per minute

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

// A same owner + same mobile + same service within this window prompts a duplicate confirmation.
export const DUPLICATE_WINDOW_MS = 1000 * 60 * 60 * 24; // 24h
