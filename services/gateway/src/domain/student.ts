import type { StudentId, UserId } from './ids.js';

/** A person enrolled for attendance, as persisted in `students`. */
export interface Student {
  id: StudentId;
  /** Institutional identifier (matriculation number), unique across students. */
  studentNumber: string;
  fullName: string;
  /** Optional contact email; null for roster-only imports. */
  email: string | null;
  /** Linked login account, or null when the student has no credentials. */
  userId: UserId | null;
  createdAt: Date;
  updatedAt: Date;
}
