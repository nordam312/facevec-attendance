import type { CourseEnrollmentId, CourseId, StudentId, UserId } from './ids.js';

/** A course/section, owned by the professor who created it. */
export interface Course {
  id: CourseId;
  /** Human-facing course code, unique across courses (e.g. `CS-401`). */
  code: string;
  title: string;
  professorId: UserId;
  createdAt: Date;
  updatedAt: Date;
}

/** Roster membership linking a student to a course. */
export interface CourseEnrollment {
  id: CourseEnrollmentId;
  courseId: CourseId;
  studentId: StudentId;
  createdAt: Date;
}
