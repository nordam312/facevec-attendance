import type { AttendanceRecord, AttendanceSession, Student } from '@prisma/client';
import { serializeStudent, type StudentDto } from '../students/student.serializer.js';

export interface SessionDto {
  id: string;
  courseId: string;
  createdById: string;
  status: AttendanceSession['status'];
  startedAt: string;
  endedAt: string | null;
}

export function serializeSession(session: AttendanceSession): SessionDto {
  return {
    id: session.id,
    courseId: session.courseId,
    createdById: session.createdById,
    status: session.status,
    startedAt: session.startedAt.toISOString(),
    endedAt: session.endedAt ? session.endedAt.toISOString() : null,
  };
}

export interface AttendanceRecordDto {
  id: string;
  sessionId: string;
  studentId: string;
  status: AttendanceRecord['status'];
  method: AttendanceRecord['method'];
  similarity: number | null;
  capturedAt: string;
  student: StudentDto;
}

export function serializeRecord(record: AttendanceRecord & { student: Student }): AttendanceRecordDto {
  return {
    id: record.id,
    sessionId: record.sessionId,
    studentId: record.studentId,
    status: record.status,
    method: record.method,
    similarity: record.similarity,
    capturedAt: record.capturedAt.toISOString(),
    student: serializeStudent(record.student),
  };
}
