import { rateLimit } from 'express-rate-limit';
import type { RequestHandler } from 'express';
import { TooManyRequestsError } from '../../errors/index.js';

/**
 * In-memory rate limiters. Phase 5 swaps the store for Redis so limits are
 * shared across gateway replicas; the limiter definitions stay the same.
 * Both route exhaustion through the central error handler (429).
 */

const reject: RequestHandler = (_req, _res, next) => {
  next(new TooManyRequestsError());
};

/** Generous default budget applied to the whole API surface. */
export const globalRateLimit = rateLimit({
  windowMs: 60_000,
  limit: 120,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: reject,
});

/** Tight budget for credential endpoints to blunt brute-force / enumeration. */
export const authRateLimit = rateLimit({
  windowMs: 60_000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: reject,
});
