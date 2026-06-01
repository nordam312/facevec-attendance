import { Prisma, type User } from '@prisma/client';
import { prisma } from '../../db/prisma.js';
import { ConflictError, NotFoundError } from '../../errors/index.js';
import { toSkipTake } from '../../http/common.schemas.js';
import type { Page } from '../../http/pagination.js';
import { hashPassword } from '../auth/password.service.js';
import type { CreateUserInput, ListUsersQuery, UpdateUserInput } from './users.schemas.js';

export async function listUsers(query: ListUsersQuery): Promise<Page<User>> {
  const where: Prisma.UserWhereInput = {};
  if (query.role) {
    where.role = query.role;
  }
  if (query.search) {
    where.OR = [
      { email: { contains: query.search, mode: 'insensitive' } },
      { displayName: { contains: query.search, mode: 'insensitive' } },
    ];
  }
  const [items, total] = await prisma.$transaction([
    prisma.user.findMany({ where, orderBy: { createdAt: 'desc' }, ...toSkipTake(query) }),
    prisma.user.count({ where }),
  ]);
  return { items, total, page: query.page, pageSize: query.pageSize };
}

export async function getUser(id: string): Promise<User> {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) {
    throw new NotFoundError('User not found');
  }
  return user;
}

export async function createUser(input: CreateUserInput): Promise<User> {
  const passwordHash = await hashPassword(input.password);
  try {
    return await prisma.user.create({
      data: {
        email: input.email,
        passwordHash,
        displayName: input.displayName,
        role: input.role,
      },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new ConflictError('An account with this email already exists');
    }
    throw err;
  }
}

export async function updateUser(id: string, input: UpdateUserInput): Promise<User> {
  const data: Prisma.UserUpdateInput = {};
  if (input.displayName !== undefined) data.displayName = input.displayName;
  if (input.role !== undefined) data.role = input.role;
  if (input.isActive !== undefined) data.isActive = input.isActive;
  if (input.password !== undefined) data.passwordHash = await hashPassword(input.password);

  try {
    return await prisma.user.update({ where: { id }, data });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === 'P2025') throw new NotFoundError('User not found');
      if (err.code === 'P2002') throw new ConflictError('An account with this email already exists');
    }
    throw err;
  }
}

export async function deleteUser(id: string): Promise<void> {
  try {
    await prisma.user.delete({ where: { id } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
      throw new NotFoundError('User not found');
    }
    throw err;
  }
}
