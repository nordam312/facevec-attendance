import { Router } from 'express';
import { isDatabaseReachable } from '../db/prisma.js';
import { asyncHandler } from '../http/async-handler.js';
import { rabbit } from '../messaging/rabbitmq.js';
import { aiBreakerState } from '../modules/ai/ai.breaker.js';
import { isRedisReady } from '../redis/redis.js';

const SERVICE = 'gateway';

/** Liveness + readiness probes (unauthenticated, not rate-limited). */
export const healthRouter: Router = Router();

healthRouter.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: SERVICE, ts: new Date().toISOString() });
});

healthRouter.get(
  '/ready',
  asyncHandler(async (_req, res) => {
    const database = await isDatabaseReachable();
    const broker = rabbit.isReady();
    const cache = isRedisReady();
    // Readiness gates on the database only: the broker and cache degrade
    // gracefully (outbox buffering; relaxed idempotency/limits), so they are
    // reported, not required.
    const ready = database;
    res.status(ready ? 200 : 503).json({
      status: ready ? 'ready' : 'not_ready',
      service: SERVICE,
      checks: {
        database: database ? 'up' : 'down',
        broker: broker ? 'up' : 'down',
        cache: cache ? 'up' : 'down',
        aiBreaker: aiBreakerState(),
      },
    });
  }),
);
