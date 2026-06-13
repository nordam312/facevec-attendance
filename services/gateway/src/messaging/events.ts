/**
 * Event catalogue. `EventType` values double as AMQP topic routing keys, so the
 * dotted namespace mirrors the exchange bindings (see topology.ts):
 *   attendance.*  / course.*  → notifications queue
 *   face.*                    → AI task queue (producers land in Phase 4)
 */

export const EventType = {
  AttendanceRecorded: 'attendance.recorded',
  CourseStudentEnrolled: 'course.student_enrolled',
  // Bulk roster import. Routed (via `import.#`) to its own queue rather than the
  // notifications fan-out, so heavy batch work never blocks live-feed events.
  CourseBulkImportRequested: 'import.bulk.requested',
  // Produced once the face pipeline endpoints exist (Phase 4).
  FaceEnrollmentRequested: 'face.enrollment.requested',
  FaceRecognitionRequested: 'face.recognition.requested',
} as const;

export type EventType = (typeof EventType)[keyof typeof EventType];

// Payload contracts (documentation + producer type-safety).
export interface AttendanceRecordedPayload {
  recordId: string;
  sessionId: string;
  courseId: string;
  studentId: string;
  status: string;
  method: string;
  capturedAt: string;
}

export interface CourseStudentEnrolledPayload {
  enrollmentId: string;
  courseId: string;
  studentId: string;
}

/** A single roster row to resolve (find-or-create) and link to the course. */
export interface BulkImportRow {
  studentNumber: string;
  fullName?: string;
  email?: string;
}

export interface CourseBulkImportRequestedPayload {
  jobId: string;
  courseId: string;
  rows: BulkImportRow[];
}
