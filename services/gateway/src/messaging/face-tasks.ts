import { rabbit } from './rabbitmq.js';

/**
 * Async fallback for face enrollment. When the AI service is unavailable, the
 * gateway enqueues the enrollment as a task (image carried as base64) instead of
 * failing; the face-task consumer processes it once the AI recovers.
 */

export const FACE_ROUTING = {
  ENROLLMENT_REQUESTED: 'face.enrollment.requested',
} as const;

export interface EnrollmentTask {
  type: 'face.enrollment.requested';
  jobId: string;
  studentId: string;
  /** Base64-encoded image bytes. */
  image: string;
  mimetype: string;
  filename: string;
}

export async function enqueueEnrollmentTask(task: EnrollmentTask): Promise<void> {
  await rabbit.publish(FACE_ROUTING.ENROLLMENT_REQUESTED, task, { messageId: task.jobId });
}
