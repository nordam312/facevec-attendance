import { PrismaClient } from '@prisma/client';
import { config } from '../config/env.js';
import { logger } from '../observability/logger.js';

/**
 * Single shared PrismaClient for the process. A second instance would open a
 * second connection pool, so it is created once and disconnected on shutdown.
 */
export const prisma = new PrismaClient({
  log: config.isDevelopment
    ? [
        { level: 'warn', emit: 'event' },
        { level: 'error', emit: 'event' },
        { level: 'query', emit: 'event' },
      ]
    : [
        { level: 'warn', emit: 'event' },
        { level: 'error', emit: 'event' },
      ],
});

prisma.$on('warn', (e) => logger.warn({ prisma: e }, 'prisma warning'));
prisma.$on('error', (e) => logger.error({ prisma: e }, 'prisma error'));
if (config.isDevelopment) {
  prisma.$on('query', (e) => logger.trace({ query: e.query, durationMs: e.duration }, 'prisma query'));
}

/** Liveness probe for the readiness endpoint. */
export async function isDatabaseReachable(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch (err) {
    logger.error({ err }, 'database readiness check failed');
    return false;
  }
}
