import { z } from 'zod';
import { paginationSchema } from '../../http/common.schemas.js';

export const roleSchema = z.enum(['PROFESSOR', 'ADMIN', 'STUDENT']);

export const createUserSchema = z.object({
  email: z.string().email().max(254).toLowerCase(),
  password: z.string().min(8).max(200),
  displayName: z.string().trim().min(1).max(120),
  role: roleSchema,
});
export type CreateUserInput = z.infer<typeof createUserSchema>;

export const updateUserSchema = z
  .object({
    displayName: z.string().trim().min(1).max(120).optional(),
    role: roleSchema.optional(),
    isActive: z.boolean().optional(),
    password: z.string().min(8).max(200).optional(),
  })
  .refine((data) => Object.values(data).some((v) => v !== undefined), {
    message: 'At least one field must be provided',
  });
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

export const listUsersQuerySchema = paginationSchema.extend({
  role: roleSchema.optional(),
  search: z.string().trim().min(1).max(120).optional(),
});
export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;
