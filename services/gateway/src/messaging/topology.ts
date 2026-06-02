import type { Channel } from 'amqplib';
import { config } from '../config/env.js';

/**
 * Broker topology. A durable topic exchange fans events out by routing key to
 * purpose-specific durable queues. Declaring it is idempotent, so every channel
 * (re)asserts it.
 *
 * The face-task fallback path uses a TTL-based retry: a failed task is parked in
 * `…retry` (which has a message TTL and dead-letters back to the main queue), so
 * retries are delayed without busy-looping; exhausted tasks land in `…dead`.
 */
export const EXCHANGE = 'facevec.events';

export const QUEUE = {
  /** AI inference task queue — drained by the gateway's face-task consumer. */
  FACE_TASKS: 'facevec.face_tasks',
  /** Delayed-retry parking queue (TTL → dead-letters back to FACE_TASKS). */
  FACE_TASKS_RETRY: 'facevec.face_tasks.retry',
  /** Terminal queue for tasks that exhausted their retries. */
  FACE_TASKS_DEAD: 'facevec.face_tasks.dead',
  /** Domain-event fan-out for notifications / projections (Phases 7+). */
  NOTIFICATIONS: 'facevec.notifications',
} as const;

export async function assertTopology(channel: Channel): Promise<void> {
  await channel.assertExchange(EXCHANGE, 'topic', { durable: true });

  await channel.assertQueue(QUEUE.FACE_TASKS, { durable: true });
  await channel.assertQueue(QUEUE.NOTIFICATIONS, { durable: true });
  await channel.assertQueue(QUEUE.FACE_TASKS_DEAD, { durable: true });
  await channel.assertQueue(QUEUE.FACE_TASKS_RETRY, {
    durable: true,
    arguments: {
      'x-message-ttl': config.FACE_TASK_RETRY_DELAY_MS,
      // Expired messages dead-letter (via the default exchange) back to the
      // main queue, where the consumer picks them up again.
      'x-dead-letter-exchange': '',
      'x-dead-letter-routing-key': QUEUE.FACE_TASKS,
    },
  });

  await channel.bindQueue(QUEUE.FACE_TASKS, EXCHANGE, 'face.#');
  await channel.bindQueue(QUEUE.NOTIFICATIONS, EXCHANGE, 'attendance.#');
  await channel.bindQueue(QUEUE.NOTIFICATIONS, EXCHANGE, 'course.#');
}
