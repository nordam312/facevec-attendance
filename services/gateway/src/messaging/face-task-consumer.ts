import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import type { Channel, ConsumeMessage } from 'amqplib';
import { config } from '../config/env.js';
import { EMBEDDING_DIMENSIONS } from '../domain/index.js';
import { logger } from '../observability/logger.js';
import { extractViaBreaker } from '../modules/ai/ai.breaker.js';
import { existsByHash, insertEmbedding } from '../modules/faces/face.repository.js';
import { rabbit } from './rabbitmq.js';
import { QUEUE, assertTopology } from './topology.js';
import type { EnrollmentTask } from './face-tasks.js';

/**
 * Drains the face-task fallback queue: extracts the embedding via the AI breaker
 * and persists it. Failures (AI still down / breaker open) are parked in the
 * delayed-retry queue with an incrementing attempt count; once attempts are
 * exhausted the task is dead-lettered. Re-establishes its channel on reconnect.
 */
class FaceTaskConsumer {
  private started = false;

  start(): void {
    if (this.started) return;
    this.started = true;
    rabbit.onConnected(() => void this.consume());
  }

  private async consume(): Promise<void> {
    try {
      const channel = await rabbit.createChannel();
      await assertTopology(channel);
      await channel.prefetch(config.FACE_TASK_PREFETCH);
      await channel.consume(QUEUE.FACE_TASKS, (msg) => {
        if (msg) void this.handle(channel, msg);
      });
      logger.info('face-task consumer attached');
    } catch (err) {
      logger.error({ err }, 'failed to start face-task consumer');
    }
  }

  private async handle(channel: Channel, msg: ConsumeMessage): Promise<void> {
    const attempts = Number(msg.properties.headers?.['x-attempts'] ?? 0);

    let task: EnrollmentTask;
    try {
      task = JSON.parse(msg.content.toString()) as EnrollmentTask;
    } catch {
      logger.error('invalid face-task payload; discarding');
      channel.ack(msg);
      return;
    }

    try {
      await this.process(task);
      channel.ack(msg);
    } catch (err) {
      const next = attempts + 1;
      if (next >= config.FACE_TASK_MAX_ATTEMPTS) {
        logger.error({ err, jobId: task.jobId, attempts: next }, 'face task exhausted retries; dead-lettering');
        channel.sendToQueue(QUEUE.FACE_TASKS_DEAD, msg.content, {
          persistent: true,
          headers: { 'x-attempts': next, 'x-error': err instanceof Error ? err.message : String(err) },
        });
      } else {
        logger.warn({ err, jobId: task.jobId, attempts: next }, 'face task failed; scheduling delayed retry');
        channel.sendToQueue(QUEUE.FACE_TASKS_RETRY, msg.content, {
          persistent: true,
          headers: { 'x-attempts': next },
        });
      }
      channel.ack(msg);
    }
  }

  private async process(task: EnrollmentTask): Promise<void> {
    const image = Buffer.from(task.image, 'base64');
    const result = await extractViaBreaker(image, task.filename, task.mimetype);

    if (!result.primary || result.primary.embedding.length !== EMBEDDING_DIMENSIONS) {
      // A valid AI response with no usable face is terminal — don't retry.
      logger.warn({ jobId: task.jobId }, 'face task produced no usable embedding; discarding');
      return;
    }

    const hash = createHash('sha256').update(image).digest('hex');
    if (await existsByHash(task.studentId, hash)) {
      logger.info({ jobId: task.jobId }, 'embedding already enrolled; skipping');
      return;
    }
    await insertEmbedding({
      studentId: task.studentId,
      embedding: result.primary.embedding,
      model: result.model,
      quality: result.primary.det_score,
      sourceImageHash: hash,
    });
    logger.info({ jobId: task.jobId, studentId: task.studentId }, 'face task enrolled embedding');
  }
}

export const faceTaskConsumer = new FaceTaskConsumer();
