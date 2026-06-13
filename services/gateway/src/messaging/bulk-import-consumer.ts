import type { Channel, ConsumeMessage } from 'amqplib';
import { Prisma } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { logger } from '../observability/logger.js';
import { resolveAndLinkStudent } from '../modules/courses/courses.service.js';
import {
  publishImportProgress,
  type ImportProgressEvent,
  type ImportRowResult,
} from '../ws/broadcaster.js';
import { rabbit } from './rabbitmq.js';
import { QUEUE, assertTopology } from './topology.js';
import type { CourseBulkImportRequestedPayload } from './events.js';

/** Rows handled between each DB progress write + WebSocket broadcast. */
const CHUNK_SIZE = 25;

interface Counts {
  created: number;
  enrolled: number;
  already: number;
  failed: number;
}

/**
 * Drains the bulk-import queue. For each job it resolves-and-links every roster
 * row via the shared `resolveAndLinkStudent` core, each row in its own
 * transaction so one bad row never rolls back the batch. Progress is persisted
 * to `import_jobs.processed_rows` and broadcast over WebSocket every chunk; the
 * final per-row report and terminal status are written on completion. Re-establishes
 * its channel on reconnect (mirrors the face-task consumer).
 */
class BulkImportConsumer {
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
      // One job at a time per consumer — bulk payloads can be large.
      await channel.prefetch(1);
      await channel.consume(QUEUE.BULK_IMPORTS, (msg) => {
        if (msg) void this.handle(channel, msg);
      });
      logger.info('bulk-import consumer attached');
    } catch (err) {
      logger.error({ err }, 'failed to start bulk-import consumer');
    }
  }

  private async handle(channel: Channel, msg: ConsumeMessage): Promise<void> {
    let payload: CourseBulkImportRequestedPayload;
    try {
      payload = JSON.parse(msg.content.toString()) as CourseBulkImportRequestedPayload;
    } catch {
      logger.error('invalid bulk-import payload; discarding');
      channel.ack(msg);
      return;
    }

    const { jobId, courseId, rows } = payload;
    try {
      const job = await prisma.importJob.findUnique({ where: { id: jobId } });
      if (!job) {
        logger.warn({ jobId }, 'bulk-import job not found; discarding');
        channel.ack(msg);
        return;
      }
      // Idempotent on redelivery: never reprocess a finished job.
      if (job.status === 'COMPLETED' || job.status === 'FAILED') {
        logger.info({ jobId, status: job.status }, 'bulk-import job already finished; skipping');
        channel.ack(msg);
        return;
      }

      await this.process(jobId, courseId, rows);
      channel.ack(msg);
    } catch (err) {
      // A failure outside per-row handling (DB down, etc.). Mark the job FAILED
      // and ack — re-queuing a poison job would only loop.
      logger.error({ err, jobId }, 'bulk-import job failed');
      await this.markFailed(jobId, courseId, rows.length, err).catch((e) =>
        logger.error({ err: e, jobId }, 'failed to mark bulk-import job FAILED'),
      );
      channel.ack(msg);
    }
  }

  private async process(
    jobId: string,
    courseId: string,
    rows: CourseBulkImportRequestedPayload['rows'],
  ): Promise<void> {
    const total = rows.length;
    const counts: Counts = { created: 0, enrolled: 0, already: 0, failed: 0 };
    const report: ImportRowResult[] = [];

    await prisma.importJob.update({
      where: { id: jobId },
      data: { status: 'PROCESSING', processedRows: 0 },
    });

    for (const [i, row] of rows.entries()) {
      try {
        const result = await prisma.$transaction((tx) =>
          resolveAndLinkStudent(tx, courseId, {
            studentNumber: row.studentNumber,
            fullName: row.fullName,
            email: row.email,
          }),
        );
        const key: 'created' | 'enrolled' | 'already' = result.created
          ? 'created'
          : result.alreadyEnrolled
            ? 'already'
            : 'enrolled';
        counts[key]++;
        report.push({ row: i + 1, studentNumber: row.studentNumber, status: key });
      } catch (err) {
        counts.failed++;
        report.push({
          row: i + 1,
          studentNumber: row.studentNumber,
          status: 'error',
          message: err instanceof Error ? err.message : String(err),
        });
      }

      // Persist + broadcast progress at each chunk boundary (and on the last row).
      const processed = i + 1;
      if (processed % CHUNK_SIZE === 0 || processed === total) {
        await prisma.importJob.update({
          where: { id: jobId },
          data: { processedRows: processed },
        });
        await this.broadcast('import.progress', jobId, courseId, 'PROCESSING', total, processed, counts);
      }
    }

    await prisma.importJob.update({
      where: { id: jobId },
      data: {
        status: 'COMPLETED',
        processedRows: total,
        report: report as unknown as Prisma.InputJsonValue,
      },
    });
    await this.broadcast('import.completed', jobId, courseId, 'COMPLETED', total, total, counts, report);
    logger.info({ jobId, ...counts }, 'bulk-import job completed');
  }

  private async markFailed(
    jobId: string,
    courseId: string,
    total: number,
    err: unknown,
  ): Promise<void> {
    const job = await prisma.importJob.update({
      where: { id: jobId },
      data: {
        status: 'FAILED',
        report: { error: err instanceof Error ? err.message : String(err) },
      },
    });
    await this.broadcast(
      'import.failed',
      jobId,
      courseId,
      'FAILED',
      total,
      job.processedRows,
      { created: 0, enrolled: 0, already: 0, failed: 0 },
    );
  }

  private broadcast(
    type: ImportProgressEvent['type'],
    jobId: string,
    courseId: string,
    status: string,
    totalRows: number,
    processedRows: number,
    counts: Counts,
    report?: ImportRowResult[],
  ): Promise<void> {
    return publishImportProgress({
      type,
      jobId,
      courseId,
      status,
      totalRows,
      processedRows,
      counts,
      ...(report ? { report } : {}),
    });
  }
}

export const bulkImportConsumer = new BulkImportConsumer();
