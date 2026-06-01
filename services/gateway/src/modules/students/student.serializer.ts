import type { Student } from '@prisma/client';

export interface StudentDto {
  id: string;
  studentNumber: string;
  fullName: string;
  email: string | null;
  userId: string | null;
  createdAt: string;
  updatedAt: string;
}

export function serializeStudent(student: Student): StudentDto {
  return {
    id: student.id,
    studentNumber: student.studentNumber,
    fullName: student.fullName,
    email: student.email,
    userId: student.userId,
    createdAt: student.createdAt.toISOString(),
    updatedAt: student.updatedAt.toISOString(),
  };
}
