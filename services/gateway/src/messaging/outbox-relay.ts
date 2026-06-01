import { config } from '../config/env.js';
import { prisma } from '../db/prisma.js';
import { logger } from '../observability/logger.js';
import { rabbit } from './rabbitmq.js';

interface OutboxRow {
  id: string;
  event_type: string;
  payload: unknown;
  attempts: number;
}

/**
 * Background relay implementing the publish side of the transactional-outbox
 * pattern. On each tick it claims a batch of publishable rows with
 * `FOR UPDATE SKIP LOCKED` (so multiple gateway replicas never double-publish),
 * publishes each with publisher confirms, and marks them PUBLISHED. A publish
 * failure leaves the row PENDING with an exponential backoff (until the attempt
 * cap, after which it is parked as FAILED). Delivery is at-least-once; consumers
 * deduplicate on the AMQP message id (the outbox row id).
 */
export class OutboxRelay {
  private timer: NodeJS.Timeout | null = null;
  private draining = false;

  constructor(
    private readonly intervalMs: number,
    private readonly batchSize: number,
    private readonly maxAttempts: number,
  ) {}

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.tick(), this.intervalMs);
    this.timer.unref();
    logger.info({ intervalMs: this.intervalMs, batchSize: this.batchSize }, 'outbox relay started');
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async tick(): Promise<void> {
    if (this.draining || !rabbit.isReady()) return;
    this.draining = true;
    try {
      let processed = 0;
      for (;;) {
        const handled = await this.drainBatch();
        processed += handled;
        if (handled < this.batchSize) break;
      }
      if (processed > 0) {
        logger.debug({ processed }, 'outbox relay drained');
      }
    } catch (err) {
      logger.error({ err }, 'outbox relay tick failed');
    } finally {
      this.draining = false;
    }
  }

  /** Claim and publish one batch; returns how many rows were claimed. */
  private drainBatch(): Promise<number> {
    return prisma.$transaction(
      async (tx) => {
        const rows = await tx.$queryRaw<OutboxRow[]>`
          SELECT id, event_type, payload, attempts
          FROM outbox_messages
          WHERE status = 'PENDING' AND available_at <= now()
          ORDER BY created_at
          LIMIT ${this.batchSize}
          FOR UPDATE SKIP LOCKED`;

        for (const row of rows) {
          try {
            await rabbit.publish(row.event_type, row.payload, { messageId: row.id });
            await tx.outboxMessage.update({
              where: { id: row.id },
              data: { status: 'PUBLISHED', publishedAt: new Date() },
            });
          } catch (err) {
            const attempts = row.attempts + 1;
            const failed = attempts >= this.maxAttempts;
            const backoffMs = Math.min(60_000, 2 ** attempts * 1000);
            await tx.outboxMessage.update({
              where: { id: row.id },
              data: {
                attempts,
                status: failed ? 'FAILED' : 'PENDING',
                lastError: err instanceof Error ? err.message : String(err),
                availableAt: new Date(Date.now() + backoffMs),
              },
            });
            logger.warn({ err, outboxId: row.id, attempts, failed }, 'outbox publish failed');
          }
        }
        return rows.length;
      },
      { timeout: 30_000 },
    );
  }
}

export const outboxRelay = new OutboxRelay(
  config.OUTBOX_POLL_INTERVAL_MS,
  config.OUTBOX_BATCH_SIZE,
  config.OUTBOX_MAX_ATTEMPTS,
);
