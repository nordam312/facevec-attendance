import { rateLimit, type Store } from 'express-rate-limit';
import { RedisStore, type RedisReply } from 'rate-limit-redis';
import type { RequestHandler } from 'express';
import { config } from '../../config/env.js';
import { TooManyRequestsError } from '../../errors/index.js';
import { getRedis } from '../../redis/redis.js';

/**
 * Rate limiters. When REDIS_URL is configured the counters live in Redis, so a
 * limit is shared across all gateway replicas; otherwise they fall back to an
 * in-process store. Both route exhaustion through the central error handler.
 */

const reject: RequestHandler = (_req, _res, next) => {
  next(new TooManyRequestsError());
};

function createStore(prefix: string): Store | undefined {
  if (!config.REDIS_URL) return undefined;
  return new RedisStore({
    prefix: `rl:${prefix}:`,
    // Commands are issued against the shared client lazily, so the limiter can
    // be constructed before Redis has finished connecting.
    sendCommand: (...args: string[]): Promise<RedisReply> => {
      const redis = getRedis();
      if (!redis) {
        throw new Error('redis client not initialised');
      }
      const [command, ...rest] = args;
      if (command === undefined) {
        throw new Error('empty redis command');
      }
      return redis.call(command, ...rest) as Promise<RedisReply>;
    },
  });
}

function makeLimiter(prefix: string, windowMs: number, limit: number): RequestHandler {
  const store = createStore(prefix);
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: reject,
    ...(store ? { store } : {}),
  });
}

/** Generous default budget applied to the whole API surface. */
export const globalRateLimit = makeLimiter('global', 60_000, 120);

/** Tight budget for credential endpoints to blunt brute-force / enumeration. */
export const authRateLimit = makeLimiter('auth', 60_000, 10);
