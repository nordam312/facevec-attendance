import { z } from 'zod';
import { paginationSchema } from '../../http/common.schemas.js';

export const createStudentSchema = z.object({
  studentNumber: z.string().trim().min(1).max(64),
  fullName: z.string().trim().min(1).max(200),
  email: z.string().email().max(254).toLowerCase().optional(),
});
export type CreateStudentInput = z.infer<typeof createStudentSchema>;

export const updateStudentSchema = z
  .object({
    studentNumber: z.string().trim().min(1).max(64).optional(),
    fullName: z.string().trim().min(1).max(200).optional(),
    email: z.string().email().max(254).toLowerCase().nullable().optional(),
  })
  .refine((data) => Object.values(data).some((v) => v !== undefined), {
    message: 'At least one field must be provided',
  });
export type UpdateStudentInput = z.infer<typeof updateStudentSchema>;

export const listStudentsQuerySchema = paginationSchema.extend({
  search: z.string().trim().min(1).max(200).optional(),
});
export type ListStudentsQuery = z.infer<typeof listStudentsQuerySchema>;
