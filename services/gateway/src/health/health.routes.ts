import { Router } from 'express';
import { isDatabaseReachable } from '../db/prisma.js';
import { asyncHandler } from '../http/async-handler.js';

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
    const ready = database;
    res.status(ready ? 200 : 503).json({
      status: ready ? 'ready' : 'not_ready',
      service: SERVICE,
      checks: { database: database ? 'up' : 'down' },
    });
  }),
);
