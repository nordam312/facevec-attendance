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

export const enrollStudentSchema = z.object({
  studentId: z.string().uuid(),
});
export type EnrollStudentInput = z.infer<typeof enrollStudentSchema>;

export const enrollmentParamsSchema = z.object({
  id: z.string().uuid(),
  studentId: z.string().uuid(),
});
export type EnrollmentParams = z.infer<typeof enrollmentParamsSchema>;
