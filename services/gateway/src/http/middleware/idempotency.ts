import type { Response } from 'express';
import type { Redis } from 'ioredis';
import { config } from '../../config/env.js';
import { ConflictError } from '../../errors/index.js';
import { getRedis, isRedisReady } from '../../redis/redis.js';
import { asyncHandler } from '../async-handler.js';

/**
 * HTTP idempotency for unsafe operations. A client retrying a mutating request
 * sends the same `Idempotency-Key` header; the first request takes a Redis lock
 * (`SET NX`), and its successful response is cached under the key. Replays return
 * the cached response (`Idempotency-Replayed: true`); a replay while the original
 * is still in flight gets 409. This is the "distributed lock prevents
 * double-scan mutations" guardrail — applied to enroll / mark / identify.
 *
 * Fails open: with no `Idempotency-Key` or no Redis, the request proceeds as
 * normal (just without the guarantee).
 */

type CachedResponse =
  | { status: 'pending' }
  | { status: 'done'; code: number; body: unknown };

function cacheOnSend(res: Response, redis: Redis, cacheKey: string, ttl: number): void {
  const originalJson = res.json.bind(res);
  res.json = ((body: unknown) => {
    const code = res.statusCode;
    if (code >= 200 && code < 300) {
      void redis.set(cacheKey, JSON.stringify({ status: 'done', code, body }), 'EX', ttl).catch(() => {});
    } else {
      // Don't cache failures — let the client retry.
      void redis.del(cacheKey).catch(() => {});
    }
    return originalJson(body);
  }) as typeof res.json;
}

export const idempotency = asyncHandler(async (req, res, next) => {
  const key = req.header('idempotency-key');
  const redis = getRedis();
  if (!key || !redis || !isRedisReady()) {
    if (key && !isRedisReady()) {
      req.log.warn('idempotency skipped: redis unavailable');
    }
    next();
    return;
  }

  const actor = req.auth?.userId ?? 'anon';
  const cacheKey = `idem:${actor}:${req.method}:${req.originalUrl}:${key}`;
  const ttl = config.IDEMPOTENCY_TTL_SECONDS;

  const existing = await redis.get(cacheKey);
  if (existing) {
    const parsed = JSON.parse(existing) as CachedResponse;
    if (parsed.status === 'pending') {
      throw new ConflictError('A request with this Idempotency-Key is already being processed');
    }
    res.setHeader('Idempotency-Replayed', 'true');
    res.status(parsed.code).json(parsed.body);
    return;
  }

  const acquired = await redis.set(cacheKey, JSON.stringify({ status: 'pending' }), 'EX', ttl, 'NX');
  if (acquired !== 'OK') {
    throw new ConflictError('A request with this Idempotency-Key is already being processed');
  }

  cacheOnSend(res, redis, cacheKey, ttl);
  next();
});
