import { Prisma, type Student } from '@prisma/client';
import { prisma } from '../../db/prisma.js';
import { ConflictError, NotFoundError } from '../../errors/index.js';
import { toSkipTake } from '../../http/common.schemas.js';
import type { Page } from '../../http/pagination.js';
import type {
  CreateStudentInput,
  ListStudentsQuery,
  UpdateStudentInput,
} from './students.schemas.js';

const DUPLICATE = 'A student with this number or email already exists';

export async function listStudents(query: ListStudentsQuery): Promise<Page<Student>> {
  const where: Prisma.StudentWhereInput = {};
  if (query.search) {
    where.OR = [
      { studentNumber: { contains: query.search, mode: 'insensitive' } },
      { fullName: { contains: query.search, mode: 'insensitive' } },
      { email: { contains: query.search, mode: 'insensitive' } },
    ];
  }
  const [items, total] = await prisma.$transaction([
    prisma.student.findMany({ where, orderBy: { createdAt: 'desc' }, ...toSkipTake(query) }),
    prisma.student.count({ where }),
  ]);
  return { items, total, page: query.page, pageSize: query.pageSize };
}

export async function getStudent(id: string): Promise<Student> {
  const student = await prisma.student.findUnique({ where: { id } });
  if (!student) {
    throw new NotFoundError('Student not found');
  }
  return student;
}

export async function createStudent(input: CreateStudentInput): Promise<Student> {
  try {
    return await prisma.student.create({
      data: {
        studentNumber: input.studentNumber,
        fullName: input.fullName,
        email: input.email ?? null,
      },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new ConflictError(DUPLICATE);
    }
    throw err;
  }
}

export async function updateStudent(id: string, input: UpdateStudentInput): Promise<Student> {
  const data: Prisma.StudentUpdateInput = {};
  if (input.studentNumber !== undefined) data.studentNumber = input.studentNumber;
  if (input.fullName !== undefined) data.fullName = input.fullName;
  if (input.email !== undefined) data.email = input.email;

  try {
    return await prisma.student.update({ where: { id }, data });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === 'P2025') throw new NotFoundError('Student not found');
      if (err.code === 'P2002') throw new ConflictError(DUPLICATE);
    }
    throw err;
  }
}

export async function deleteStudent(id: string): Promise<void> {
  try {
    await prisma.student.delete({ where: { id } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
      throw new NotFoundError('Student not found');
    }
    throw err;
  }
}
