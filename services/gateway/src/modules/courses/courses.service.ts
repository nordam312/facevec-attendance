import { Prisma, type Course, type CourseEnrollment, type Student } from '@prisma/client';
import { prisma } from '../../db/prisma.js';
import { Role } from '../../domain/index.js';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '../../errors/index.js';
import { toSkipTake } from '../../http/common.schemas.js';
import type { Page } from '../../http/pagination.js';
import type { AuthContext } from '../../http/types.js';
import type {
  CreateCourseInput,
  ListCoursesQuery,
  UpdateCourseInput,
} from './courses.schemas.js';

type EnrollmentWithStudent = CourseEnrollment & { student: Student };

/** Professors may only touch their own courses; admins may touch any. */
function assertAccess(course: Course, actor: AuthContext): void {
  if (actor.role !== Role.ADMIN && course.professorId !== actor.userId) {
    throw new ForbiddenError('You do not have access to this course');
  }
}

/** Fetch a course and assert the actor is allowed to operate on it. */
export async function getCourseForActor(id: string, actor: AuthContext): Promise<Course> {
  const course = await prisma.course.findUnique({ where: { id } });
  if (!course) {
    throw new NotFoundError('Course not found');
  }
  assertAccess(course, actor);
  return course;
}

export async function listCourses(query: ListCoursesQuery, actor: AuthContext): Promise<Page<Course>> {
  const where: Prisma.CourseWhereInput = {};
  if (actor.role !== Role.ADMIN) {
    where.professorId = actor.userId;
  } else if (query.professorId) {
    where.professorId = query.professorId;
  }
  if (query.search) {
    where.OR = [
      { code: { contains: query.search, mode: 'insensitive' } },
      { title: { contains: query.search, mode: 'insensitive' } },
    ];
  }
  const [items, total] = await prisma.$transaction([
    prisma.course.findMany({ where, orderBy: { createdAt: 'desc' }, ...toSkipTake(query) }),
    prisma.course.count({ where }),
  ]);
  return { items, total, page: query.page, pageSize: query.pageSize };
}

export function getCourse(id: string, actor: AuthContext): Promise<Course> {
  return getCourseForActor(id, actor);
}

export async function createCourse(input: CreateCourseInput, actor: AuthContext): Promise<Course> {
  // Only admins may assign a course to another professor.
  const professorId =
    actor.role === Role.ADMIN && input.professorId ? input.professorId : actor.userId;
  try {
    return await prisma.course.create({
      data: { code: input.code, title: input.title, professorId },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === 'P2002') throw new ConflictError('A course with this code already exists');
      if (err.code === 'P2003') throw new BadRequestError('Assigned professor does not exist');
    }
    throw err;
  }
}

export async function updateCourse(
  id: string,
  input: UpdateCourseInput,
  actor: AuthContext,
): Promise<Course> {
  await getCourseForActor(id, actor);
  const data: Prisma.CourseUncheckedUpdateInput = {};
  if (input.code !== undefined) data.code = input.code;
  if (input.title !== undefined) data.title = input.title;
  // Reassigning the owning professor is an admin-only action.
  if (input.professorId !== undefined && actor.role === Role.ADMIN) {
    data.professorId = input.professorId;
  }
  try {
    return await prisma.course.update({ where: { id }, data });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === 'P2002') throw new ConflictError('A course with this code already exists');
      if (err.code === 'P2003') throw new BadRequestError('Assigned professor does not exist');
    }
    throw err;
  }
}

export async function deleteCourse(id: string, actor: AuthContext): Promise<void> {
  await getCourseForActor(id, actor);
  await prisma.course.delete({ where: { id } });
}

export async function listEnrollments(
  courseId: string,
  query: { page: number; pageSize: number },
  actor: AuthContext,
): Promise<Page<EnrollmentWithStudent>> {
  await getCourseForActor(courseId, actor);
  const where: Prisma.CourseEnrollmentWhereInput = { courseId };
  const [items, total] = await prisma.$transaction([
    prisma.courseEnrollment.findMany({
      where,
      include: { student: true },
      orderBy: { createdAt: 'desc' },
      ...toSkipTake(query),
    }),
    prisma.courseEnrollment.count({ where }),
  ]);
  return { items, total, page: query.page, pageSize: query.pageSize };
}

export async function enrollStudent(
  courseId: string,
  studentId: string,
  actor: AuthContext,
): Promise<EnrollmentWithStudent> {
  await getCourseForActor(courseId, actor);
  try {
    return await prisma.courseEnrollment.create({
      data: { courseId, studentId },
      include: { student: true },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === 'P2002') throw new ConflictError('Student is already enrolled in this course');
      if (err.code === 'P2003') throw new NotFoundError('Student not found');
    }
    throw err;
  }
}

export async function unenrollStudent(
  courseId: string,
  studentId: string,
  actor: AuthContext,
): Promise<void> {
  await getCourseForActor(courseId, actor);
  try {
    await prisma.courseEnrollment.delete({
      where: { courseId_studentId: { courseId, studentId } },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
      throw new NotFoundError('Enrollment not found');
    }
    throw err;
  }
}
