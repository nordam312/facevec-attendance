import {
  Prisma,
  type AttendanceRecord,
  type AttendanceSession,
  type Student,
} from '@prisma/client';
import { prisma } from '../../db/prisma.js';
import { AttendanceMethod, Role, SessionStatus } from '../../domain/index.js';
import { ConflictError, ForbiddenError, NotFoundError } from '../../errors/index.js';
import { toSkipTake } from '../../http/common.schemas.js';
import type { Page } from '../../http/pagination.js';
import type { AuthContext } from '../../http/types.js';
import { EventType } from '../../messaging/events.js';
import { recordEvent } from '../../messaging/outbox.js';
import { getCourseForActor } from '../courses/courses.service.js';
import type { MarkAttendanceInput } from './attendance.schemas.js';

type RecordWithStudent = AttendanceRecord & { student: Student };

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
