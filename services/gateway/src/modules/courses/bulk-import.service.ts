import type { ImportJob } from '@prisma/client';
import { prisma } from '../../db/prisma.js';
import { NotFoundError } from '../../errors/index.js';
import type { AuthContext } from '../../http/types.js';
import { EventType } from '../../messaging/events.js';
import type { BulkImportRow } from '../../messaging/events.js';
import { recordEvent } from '../../messaging/outbox.js';
import { getCourseForActor } from './courses.service.js';
import type { BulkImportRowInput } from './courses.schemas.js';

/**
 * Create a bulk-import job and request its processing — atomically. The
 * `ImportJob` row (PENDING) and the `CourseBulkImportRequested` outbox event are
 * written in one transaction, so the worker is asked to process the job if and
 * only if the job row is durable (transactional-outbox guarantee). The HTTP
 * handler returns 202 immediately; the outbox relay then publishes the event to
 * RabbitMQ and the bulk-import consumer drains it.
 */
export async function createBulkImportJob(
  courseId: string,
  rows: BulkImportRowInput[],
  actor: AuthContext,
): Promise<ImportJob> {
  await getCourseForActor(courseId, actor);

  return prisma.$transaction(async (tx) => {
    const job = await tx.importJob.create({
      data: {
        courseId,
        createdById: actor.userId,
        status: 'PENDING',
        totalRows: rows.length,
        processedRows: 0,
      },
    });
    await recordEvent(tx, {
      aggregateType: 'ImportJob',
      aggregateId: job.id,
      eventType: EventType.CourseBulkImportRequested,
      payload: { jobId: job.id, courseId, rows: rows as BulkImportRow[] },
    });
    return job;
  });
}

/** Fetch a job scoped to a course the actor may access (status polling / report). */
export async function getImportJob(
  courseId: string,
  jobId: string,
  actor: AuthContext,
): Promise<ImportJob> {
  await getCourseForActor(courseId, actor);
  const job = await prisma.importJob.findUnique({ where: { id: jobId } });
  if (!job || job.courseId !== courseId) {
    throw new NotFoundError('Import job not found');
  }
  return job;
}

/**
 * Authorize a WebSocket subscription to a job's live progress: the job must
 * exist and the actor must have access to its course. Returns the job so the
 * caller can seed the UI with the current state.
 */
export async function assertImportJobAccess(jobId: string, actor: AuthContext): Promise<ImportJob> {
  const job = await prisma.importJob.findUnique({ where: { id: jobId } });
  if (!job) throw new NotFoundError('Import job not found');
  await getCourseForActor(job.courseId, actor);
  return job;
}
