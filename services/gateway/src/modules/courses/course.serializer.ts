import type { Course, CourseEnrollment, Student } from '@prisma/client';
import { serializeStudent, type StudentDto } from '../students/student.serializer.js';

export interface CourseDto {
  id: string;
  code: string;
  title: string;
  professorId: string;
  createdAt: string;
  updatedAt: string;
}

export function serializeCourse(course: Course): CourseDto {
  return {
    id: course.id,
    code: course.code,
    title: course.title,
    professorId: course.professorId,
    createdAt: course.createdAt.toISOString(),
    updatedAt: course.updatedAt.toISOString(),
  };
}

export interface EnrollmentDto {
  id: string;
  courseId: string;
  studentId: string;
  enrolledAt: string;
  student: StudentDto;
}

export function serializeEnrollment(enrollment: CourseEnrollment & { student: Student }): EnrollmentDto {
  return {
    id: enrollment.id,
    courseId: enrollment.courseId,
    studentId: enrollment.studentId,
    enrolledAt: enrollment.createdAt.toISOString(),
    student: serializeStudent(enrollment.student),
  };
}
