export type Role = 'PROFESSOR' | 'ADMIN' | 'STUDENT';

export interface User {
  id: string;
  email: string;
  displayName: string;
  role: Role;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Course {
  id: string;
  code: string;
  title: string;
  professorId: string;
  createdAt: string;
  updatedAt: string;
}

export interface Student {
  id: string;
  studentNumber: string;
  fullName: string;
  email: string | null;
  userId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Enrollment {
  id: string;
  courseId: string;
  studentId: string;
  enrolledAt: string;
  student: Student;
}

export interface FaceEmbedding {
  id: string;
  studentId: string;
  model: string;
  quality: number | null;
  sourceImageHash: string | null;
  createdAt: string;
}

export type SessionStatus = 'OPEN' | 'CLOSED';

export interface Session {
  id: string;
  courseId: string;
  createdById: string;
  status: SessionStatus;
  startedAt: string;
  endedAt: string | null;
}

export type AttendanceStatus = 'PRESENT' | 'LATE' | 'ABSENT';
export type AttendanceMethod = 'FACE' | 'MANUAL';

export interface AttendanceRecord {
  id: string;
  sessionId: string;
  studentId: string;
  status: AttendanceStatus;
  method: AttendanceMethod;
  similarity: number | null;
  capturedAt: string;
  student: Student;
}

export interface Paginated<T> {
  data: T[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
}

export interface IdentifyResult {
  matched: boolean;
  similarity: number | null;
  threshold: number;
  student: { id: string; fullName: string; studentNumber: string } | null;
  record: AttendanceRecord | null;
}

/** Live event pushed over the WebSocket feed. */
export interface AttendanceEvent {
  type: 'attendance.recorded';
  sessionId: string;
  courseId: string;
  studentId: string;
  status: AttendanceStatus;
  method: AttendanceMethod;
  similarity: number | null;
  capturedAt: string;
  recordId: string;
}
