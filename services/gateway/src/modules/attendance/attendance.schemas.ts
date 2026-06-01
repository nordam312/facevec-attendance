import { z } from 'zod';

export const attendanceStatusSchema = z.enum(['PRESENT', 'LATE', 'ABSENT']);

/** Manually record (or correct) a student's presence in a session. */
export const markAttendanceSchema = z.object({
  studentId: z.string().uuid(),
  status: attendanceStatusSchema.default('PRESENT'),
});
export type MarkAttendanceInput = z.infer<typeof markAttendanceSchema>;
