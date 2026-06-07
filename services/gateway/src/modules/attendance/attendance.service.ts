import {
  Prisma,
  type AttendanceRecord,
  type AttendanceSession,
  type Student,
} from '@prisma/client';
import { prisma } from '../../db/prisma.js';
import { config } from '../../config/env.js';
import { AttendanceMethod, AttendanceStatus, Role, SessionStatus } from '../../domain/index.js';
import { ConflictError, ForbiddenError, HttpError, NotFoundError } from '../../errors/index.js';
import { toSkipTake } from '../../http/common.schemas.js';
import type { Page } from '../../http/pagination.js';
import type { AuthContext } from '../../http/types.js';
import { EventType } from '../../messaging/events.js';
import { recordEvent } from '../../messaging/outbox.js';
import { identifyTotal } from '../../observability/metrics.js';
import { extractViaBreaker, isAiFailure } from '../ai/ai.breaker.js';
import { getCourseForActor } from '../courses/courses.service.js';
import { searchNearestInCourse } from '../faces/face.repository.js';
import type { MarkAttendanceInput } from './attendance.schemas.js';

type RecordWithStudent = AttendanceRecord & { student: Student };

export interface UploadedImage {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
}

export interface IdentifyResult {
  matched: boolean;
  similarity: number | null;
  threshold: number;
  student: { id: string; fullName: string; studentNumber: string } | null;
  record: RecordWithStudent | null;
}

/** Fetch a session and assert the actor owns its course (or is an admin). */
async function getSessionForActor(id: string, actor: AuthContext): Promise<AttendanceSession> {
  const session = await prisma.attendanceSession.findUnique({
    where: { id },
    include: { course: true },
  });
  if (!session) {
    throw new NotFoundError('Session not found');
  }
  if (actor.role !== Role.ADMIN && session.course.professorId !== actor.userId) {
    throw new ForbiddenError('You do not have access to this session');
  }
  return session;
}

export async function openSession(courseId: string, actor: AuthContext): Promise<AttendanceSession> {
  await getCourseForActor(courseId, actor);
  return prisma.attendanceSession.create({
    data: { courseId, createdById: actor.userId, status: SessionStatus.OPEN },
  });
}

export async function listSessions(
  courseId: string,
  query: { page: number; pageSize: number },
  actor: AuthContext,
): Promise<Page<AttendanceSession>> {
  await getCourseForActor(courseId, actor);
  const where: Prisma.AttendanceSessionWhereInput = { courseId };
  const [items, total] = await prisma.$transaction([
    prisma.attendanceSession.findMany({
      where,
      orderBy: { startedAt: 'desc' },
      ...toSkipTake(query),
    }),
    prisma.attendanceSession.count({ where }),
  ]);
  return { items, total, page: query.page, pageSize: query.pageSize };
}

export function getSession(id: string, actor: AuthContext): Promise<AttendanceSession> {
  return getSessionForActor(id, actor);
}

export async function closeSession(id: string, actor: AuthContext): Promise<AttendanceSession> {
  const session = await getSessionForActor(id, actor);
  if (session.status === SessionStatus.CLOSED) {
    throw new ConflictError('Session is already closed');
  }
  return prisma.attendanceSession.update({
    where: { id },
    data: { status: SessionStatus.CLOSED, endedAt: new Date() },
  });
}

/**
 * Manually record (or correct) a student's presence. Idempotent on
 * (session, student) thanks to the unique constraint — re-marking updates the
 * existing row rather than erroring.
 */
export async function markAttendance(
  sessionId: string,
  input: MarkAttendanceInput,
  actor: AuthContext,
): Promise<RecordWithStudent> {
  const session = await getSessionForActor(sessionId, actor);
  if (session.status !== SessionStatus.OPEN) {
    throw new ConflictError('Cannot record attendance for a closed session');
  }
  try {
    // Upsert the record and emit the event atomically (transactional outbox).
    return await prisma.$transaction(async (tx) => {
      const record = await tx.attendanceRecord.upsert({
        where: { sessionId_studentId: { sessionId, studentId: input.studentId } },
        create: {
          sessionId,
          studentId: input.studentId,
          status: input.status,
          method: AttendanceMethod.MANUAL,
        },
        update: { status: input.status, method: AttendanceMethod.MANUAL },
        include: { student: true },
      });
      await recordEvent(tx, {
        aggregateType: 'AttendanceSession',
        aggregateId: sessionId,
        eventType: EventType.AttendanceRecorded,
        payload: {
          recordId: record.id,
          sessionId,
          courseId: session.courseId,
          studentId: record.studentId,
          status: record.status,
          method: record.method,
          capturedAt: record.capturedAt.toISOString(),
        },
      });
      return record;
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2003') {
      throw new NotFoundError('Student not found');
    }
    throw err;
  }
}

export async function listRecords(
  sessionId: string,
  query: { page: number; pageSize: number },
  actor: AuthContext,
): Promise<Page<RecordWithStudent>> {
  await getSessionForActor(sessionId, actor);
  const where: Prisma.AttendanceRecordWhereInput = { sessionId };
  const [items, total] = await prisma.$transaction([
    prisma.attendanceRecord.findMany({
      where,
      include: { student: true },
      orderBy: { capturedAt: 'desc' },
      ...toSkipTake(query),
    }),
    prisma.attendanceRecord.count({ where }),
  ]);
  return { items, total, page: query.page, pageSize: query.pageSize };
}

/**
 * Identify a face against the session's course roster and, on an above-threshold
 * match, record PRESENT (method FACE) — atomically emitting `attendance.recorded`
 * via the outbox. Returns `matched: false` (no write) when nothing clears the
 * threshold, so the caller can surface "unrecognised".
 */
export async function identifyAndRecord(
  sessionId: string,
  file: UploadedImage,
  actor: AuthContext,
): Promise<IdentifyResult> {
  const session = await getSessionForActor(sessionId, actor);
  if (session.status !== SessionStatus.OPEN) {
    throw new ConflictError('Cannot identify for a closed session');
  }

  let extraction;
  try {
    extraction = await extractViaBreaker(file.buffer, file.originalname, file.mimetype);
  } catch (err) {
    // Identification is real-time: no async fallback — surface unavailability.
    if (isAiFailure(err)) {
      throw new HttpError(503, 'ai_unavailable', 'Face inference is temporarily unavailable');
    }
    throw err;
  }
  if (!extraction.primary) {
    throw new HttpError(422, 'no_face_detected', 'No face detected in the image');
  }

  const threshold = config.FACE_MATCH_THRESHOLD;
  const [best] = await searchNearestInCourse(session.courseId, extraction.primary.embedding, 1);

  if (!best || best.similarity < threshold) {
    identifyTotal.inc({ result: 'unmatched' });
    return { matched: false, similarity: best?.similarity ?? null, threshold, student: null, record: null };
  }
  identifyTotal.inc({ result: 'matched' });

  const record = await prisma.$transaction(async (tx) => {
    const upserted = await tx.attendanceRecord.upsert({
      where: { sessionId_studentId: { sessionId, studentId: best.studentId } },
      create: {
        sessionId,
        studentId: best.studentId,
        status: AttendanceStatus.PRESENT,
        method: AttendanceMethod.FACE,
        similarity: best.similarity,
      },
      update: {
        status: AttendanceStatus.PRESENT,
        method: AttendanceMethod.FACE,
        similarity: best.similarity,
      },
      include: { student: true },
    });
    await recordEvent(tx, {
      aggregateType: 'AttendanceSession',
      aggregateId: sessionId,
      eventType: EventType.AttendanceRecorded,
      payload: {
        recordId: upserted.id,
        sessionId,
        courseId: session.courseId,
        studentId: upserted.studentId,
        status: upserted.status,
        method: upserted.method,
        similarity: upserted.similarity,
        capturedAt: upserted.capturedAt.toISOString(),
      },
    });
    return upserted;
  });

  return {
    matched: true,
    similarity: best.similarity,
    threshold,
    student: { id: best.studentId, fullName: best.fullName, studentNumber: best.studentNumber },
    record,
  };
}
