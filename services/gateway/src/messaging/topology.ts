import type { ConfirmChannel } from 'amqplib';

/**
 * Broker topology. A single durable topic exchange fans events out by routing
 * key to purpose-specific durable queues. Declaring it is idempotent, so every
 * connection (re)asserts it — the gateway can boot before the queues exist.
 */
export const EXCHANGE = 'facevec.events';

export const QUEUE = {
  /** AI inference task queue — consumed in Phase 4. */
  FACE_TASKS: 'facevec.face_tasks',
  /** Domain-event fan-out for notifications / projections (Phases 6–7). */
  NOTIFICATIONS: 'facevec.notifications',
} as const;

export async function assertTopology(channel: ConfirmChannel): Promise<void> {
  await channel.assertExchange(EXCHANGE, 'topic', { durable: true });

  await channel.assertQueue(QUEUE.FACE_TASKS, { durable: true });
  await channel.assertQueue(QUEUE.NOTIFICATIONS, { durable: true });

  await channel.bindQueue(QUEUE.FACE_TASKS, EXCHANGE, 'face.#');
  await channel.bindQueue(QUEUE.NOTIFICATIONS, EXCHANGE, 'attendance.#');
  await channel.bindQueue(QUEUE.NOTIFICATIONS, EXCHANGE, 'course.#');
}
