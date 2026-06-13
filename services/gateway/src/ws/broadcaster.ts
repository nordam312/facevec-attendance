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
const IMPORT_CHANNEL = 'ws:import';

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

/** One row's outcome in a finished bulk import (stored in the job report). */
export interface ImportRowResult {
  row: number;
  studentNumber: string;
  status: 'created' | 'enrolled' | 'already' | 'error';
  message?: string;
}

/** Live bulk-import progress pushed to subscribers of the job's topic. */
export interface ImportProgressEvent {
  type: 'import.progress' | 'import.completed' | 'import.failed';
  jobId: string;
  courseId: string;
  status: string;
  totalRows: number;
  processedRows: number;
  counts: { created: number; enrolled: number; already: number; failed: number };
  /** Per-row report — only on the terminal `import.completed` frame. */
  report?: ImportRowResult[];
}

/** Connection-registry topic key for an import job's progress stream. */
export function importTopic(jobId: string): string {
  return `import:${jobId}`;
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
    try {
      if (channel === CHANNEL) {
        const event = JSON.parse(message) as AttendanceEvent;
        connectionRegistry.broadcast(event.sessionId, event);
      } else if (channel === IMPORT_CHANNEL) {
        const event = JSON.parse(message) as ImportProgressEvent;
        connectionRegistry.broadcast(importTopic(event.jobId), event);
      }
    } catch (err) {
      logger.error({ err }, 'ws broadcaster: bad pub/sub payload');
    }
  });
  subscriber
    .subscribe(CHANNEL, IMPORT_CHANNEL)
    .catch((err) => logger.error({ err }, 'ws broadcaster subscribe failed'));
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

/** Publish a bulk-import progress frame to all replicas (or locally if no Redis). */
export async function publishImportProgress(event: ImportProgressEvent): Promise<void> {
  const redis = getRedis();
  if (subscriber && redis && isRedisReady()) {
    await redis.publish(IMPORT_CHANNEL, JSON.stringify(event));
  } else {
    connectionRegistry.broadcast(importTopic(event.jobId), event);
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
