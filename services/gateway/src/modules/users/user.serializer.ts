import type { User } from '@prisma/client';

/** Client-facing user shape. Never includes `passwordHash`. */
export interface UserDto {
  id: string;
  email: string;
  displayName: string;
  role: User['role'];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export function serializeUser(user: User): UserDto {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    isActive: user.isActive,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}
