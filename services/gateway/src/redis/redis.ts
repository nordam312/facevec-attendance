import { Redis } from 'ioredis';
import { config } from '../config/env.js';
import { logger } from '../observability/logger.js';

/**
 * Shared Redis client. Redis backs three concerns: distributed (cross-replica)
 * rate limiting, idempotency locks/response cache, and access-token revocation.
 * All three degrade gracefully when Redis is absent or down — the gateway keeps
 * serving, with those guarantees relaxed — so `REDIS_URL` is optional.
 */
let client: Redis | null = null;

export function initRedis(): void {
  if (!config.REDIS_URL) {
    logger.warn('REDIS_URL not set — idempotency, shared rate-limit, and token revocation are disabled');
    return;
  }
  client = new Redis(config.REDIS_URL, {
    maxRetriesPerRequest: 2,
    enableReadyCheck: true,
    retryStrategy: (times) => Math.min(times * 200, 2000),
  });
  client.on('ready', () => logger.info('redis connected'));
  client.on('error', (err) => logger.error({ err }, 'redis error'));
  client.on('close', () => logger.warn('redis connection closed'));
}

export function getRedis(): Redis | null {
  return client;
}

/** True only when a command can be served right now. */
export function isRedisReady(): boolean {
  return client !== null && client.status === 'ready';
}

export async function closeRedis(): Promise<void> {
  if (!client) return;
  try {
    await client.quit();
  } catch {
    client.disconnect();
  }
  client = null;
}
