import { z } from 'zod';
import { paginationSchema } from '../../http/common.schemas.js';

export const createCourseSchema = z.object({
  code: z.string().trim().min(1).max(32),
  title: z.string().trim().min(1).max(200),
  // Admins may assign a course to a professor; ignored for professor callers.
  professorId: z.string().uuid().optional(),
});
export type CreateCourseInput = z.infer<typeof createCourseSchema>;

export const updateCourseSchema = z
  .object({
    code: z.string().trim().min(1).max(32).optional(),
    title: z.string().trim().min(1).max(200).optional(),
    professorId: z.string().uuid().optional(),
  })
  .refine((data) => Object.values(data).some((v) => v !== undefined), {
    message: 'At least one field must be provided',
  });
export type UpdateCourseInput = z.infer<typeof updateCourseSchema>;

export const listCoursesQuerySchema = paginationSchema.extend({
  search: z.string().trim().min(1).max(200).optional(),
  professorId: z.string().uuid().optional(),
});
export type ListCoursesQuery = z.infer<typeof listCoursesQuerySchema>;

// Enroll either an existing student (by uuid, picked from autocomplete) or a
// free-text roster row (studentNumber [+ fullName] — find-or-created server-side).
export const enrollStudentSchema = z
  .object({
    studentId: z.string().uuid().optional(),
    studentNumber: z.string().trim().min(1).max(64).optional(),
    fullName: z.string().trim().min(1).max(200).optional(),
    email: z.string().email().max(254).toLowerCase().optional(),
  })
  .refine((d) => Boolean(d.studentId) || Boolean(d.studentNumber), {
    message: 'Provide either an existing studentId or a studentNumber to enroll.',
  });
export type EnrollStudentInput = z.infer<typeof enrollStudentSchema>;

export const enrollmentParamsSchema = z.object({
  id: z.string().uuid(),
  studentId: z.string().uuid(),
});
export type EnrollmentParams = z.infer<typeof enrollmentParamsSchema>;

// ---- Bulk roster import -----------------------------------------------------

export const bulkImportRowSchema = z.object({
  studentNumber: z.string().trim().min(1).max(64),
  fullName: z.string().trim().min(1).max(200).optional(),
  email: z.string().email().max(254).toLowerCase().optional(),
});
export type BulkImportRowInput = z.infer<typeof bulkImportRowSchema>;

export const bulkEnrollSchema = z.object({
  // Rows are parsed from CSV/Excel at the edge (browser) and posted as JSON.
  rows: z.array(bulkImportRowSchema).min(1).max(2000),
});
export type BulkEnrollInput = z.infer<typeof bulkEnrollSchema>;

export const importJobParamsSchema = z.object({
  id: z.string().uuid(),
  jobId: z.string().uuid(),
});
export type ImportJobParams = z.infer<typeof importJobParamsSchema>;
