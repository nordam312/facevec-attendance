import type {
  AttendanceRecordId,
  AttendanceSessionId,
  CourseId,
  StudentId,
  UserId,
} from './ids.js';

export const SessionStatus = {
  OPEN: 'OPEN',
  CLOSED: 'CLOSED',
} as const;
export type SessionStatus = (typeof SessionStatus)[keyof typeof SessionStatus];

export const AttendanceStatus = {
  PRESENT: 'PRESENT',
  LATE: 'LATE',
  ABSENT: 'ABSENT',
} as const;
export type AttendanceStatus = (typeof AttendanceStatus)[keyof typeof AttendanceStatus];

export const AttendanceMethod = {
  /** Recorded by face recognition. */
  FACE: 'FACE',
  /** Recorded manually by a professor/admin. */
  MANUAL: 'MANUAL',
} as const;
export type AttendanceMethod = (typeof AttendanceMethod)[keyof typeof AttendanceMethod];

/** A live attendance window opened by a professor for one course. */
export interface AttendanceSession {
  id: AttendanceSessionId;
  courseId: CourseId;
  createdById: UserId;
  status: SessionStatus;
  startedAt: Date;
  /** When the window closed, or null while still OPEN. */
  endedAt: Date | null;
}

/**
 * One student's presence in one session. The (sessionId, studentId) pair is
 * unique — the database-level idempotency boundary that makes repeated
 * recognitions of the same face safe.
 */
export interface AttendanceRecord {
  id: AttendanceRecordId;
  sessionId: AttendanceSessionId;
  studentId: StudentId;
  status: AttendanceStatus;
  method: AttendanceMethod;
  /** Cosine similarity of the matched embedding; null for MANUAL records. */
  similarity: number | null;
  capturedAt: Date;
}

/** A session accepts recognitions only while OPEN and not yet ended. */
export function isSessionOpen(session: AttendanceSession): boolean {
  return session.status === SessionStatus.OPEN && session.endedAt === null;
}
