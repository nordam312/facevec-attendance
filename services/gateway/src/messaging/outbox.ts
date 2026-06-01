import { Prisma } from '@prisma/client';
import type { EventType } from './events.js';

export interface OutboxEventInput {
  /** Aggregate the event belongs to (e.g. "AttendanceSession", "Course"). */
  aggregateType: string;
  aggregateId: string;
  /** Event type — also the AMQP routing key. */
  eventType: EventType;
  payload: Record<string, unknown>;
}

/**
 * Append an event to the outbox **inside the caller's transaction**. The
 * business write and this insert commit atomically, so the event is published
 * if and only if the write is durable. Always call with a `tx` client from
 * `prisma.$transaction`, never the root client.
 */
export async function recordEvent(
  tx: Prisma.TransactionClient,
  event: OutboxEventInput,
): Promise<void> {
  await tx.outboxMessage.create({
    data: {
      aggregateType: event.aggregateType,
      aggregateId: event.aggregateId,
      eventType: event.eventType,
      payload: event.payload as Prisma.InputJsonValue,
    },
  });
}
