// rate-limit.ts — global + login-specific rate limiting (brute-force protection).
import rateLimit from 'express-rate-limit';
import {
  GLOBAL_RATE_MAX,
  GLOBAL_RATE_WINDOW_MS,
  LOGIN_RATE_MAX,
  LOGIN_RATE_WINDOW_MS,
} from '../config/constants';
import { isTest } from '../config/env';

const json = { code: 'RATE_LIMITED', message: 'Too many requests, please slow down' };

export const globalRateLimit = rateLimit({
  windowMs: GLOBAL_RATE_WINDOW_MS,
  limit: isTest ? 100000 : GLOBAL_RATE_MAX,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: json,
});

export const loginRateLimit = rateLimit({
  windowMs: LOGIN_RATE_WINDOW_MS,
  limit: isTest ? 100000 : LOGIN_RATE_MAX,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { code: 'RATE_LIMITED', message: 'Too many login attempts. Try again later.' },
});

// Stricter limit for unauthenticated write endpoints (registration, public form submissions)
// to curb automated abuse / queue flooding.
export const publicSubmitRateLimit = rateLimit({
  windowMs: LOGIN_RATE_WINDOW_MS, // 15 min
  limit: isTest ? 100000 : 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { code: 'RATE_LIMITED', message: 'Too many submissions. Please try again later.' },
});
