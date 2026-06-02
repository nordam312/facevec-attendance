import type { Redis } from 'ioredis';
import { logger } from '../observability/logger.js';
import { getRedis, isRedisReady } from '../redis/redis.js';
import { connectionRegistry } from './connection-registry.js';

/**
 * Cross-replica fan-out for live attendance events. The single replica that
 * consumes a notification publishes it to a Redis pub/sub channel; every replica
 * (including that one) is subscribed and fans the event out to its local
 * WebSocket subscribers. With no Redis, it degrades to local-only delivery.
 */
const CHANNEL = 'ws:attendance';

export interface AttendanceEvent {
  type: 'attendance.recorded';
  sessionId: string;
  courseId: string;
  studentId: string;
  status: string;
  method: string;
  similarity: number | null;
  capturedAt: string;
  recordId: string;
}

let subscriber: Redis | null = null;

export function initBroadcaster(): void {
  const redis = getRedis();
  if (!redis) {
    logger.warn('ws broadcaster: no Redis — live feed is local-only (single instance)');
    return;
  }
  // pub/sub needs a dedicated connection (a subscribed client can't run other commands).
  subscriber = redis.duplicate();
  subscriber.on('error', (err) => logger.error({ err }, 'ws broadcaster subscriber error'));
  subscriber.on('message', (channel, message) => {
    if (channel !== CHANNEL) return;
    try {
      const event = JSON.parse(message) as AttendanceEvent;
      connectionRegistry.broadcast(event.sessionId, event);
    } catch (err) {
      logger.error({ err }, 'ws broadcaster: bad pub/sub payload');
    }
  });
  subscriber.subscribe(CHANNEL).catch((err) => logger.error({ err }, 'ws broadcaster subscribe failed'));
}

/** Publish an attendance event to all replicas (or fan out locally if no Redis). */
export async function publishAttendance(event: AttendanceEvent): Promise<void> {
  const redis = getRedis();
  if (subscriber && redis && isRedisReady()) {
    await redis.publish(CHANNEL, JSON.stringify(event));
  } else {
    connectionRegistry.broadcast(event.sessionId, event);
  }
}

export async function closeBroadcaster(): Promise<void> {
  if (!subscriber) return;
  try {
    await subscriber.quit();
  } catch {
    subscriber.disconnect();
  }
  subscriber = null;
}
