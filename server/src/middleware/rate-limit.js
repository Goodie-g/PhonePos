import rateLimit from 'express-rate-limit';

const json = (message) => ({ error: { code: 'RATE_LIMITED', message } });

/** Strict limiter for credential endpoints (login, register, refresh). */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: json('Too many attempts, please try again later'),
});

/** Generous default for the rest of the API (dev-friendly). */
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 600,
  standardHeaders: true,
  legacyHeaders: false,
  message: json('Too many requests, slow down'),
});
