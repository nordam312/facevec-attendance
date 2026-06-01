import { Prisma, type User } from '@prisma/client';
import { prisma } from '../../db/prisma.js';
import { Role } from '../../domain/index.js';
import { ConflictError, ForbiddenError, UnauthorizedError } from '../../errors/index.js';
import { logger } from '../../observability/logger.js';
import { hashPassword, verifyPassword } from './password.service.js';
import {
  generateRefreshToken,
  hashRefreshToken,
  refreshTokenExpiry,
  signAccessToken,
} from './token.service.js';
import type { LoginInput, RegisterInput } from './auth.schemas.js';

/** Per-request metadata stamped onto issued refresh tokens (audit/forensics). */
export interface RequestContext {
  userAgent: string | null;
  ip: string | null;
}

export interface AuthResult {
  user: User;
  accessToken: string;
  refreshToken: string;
}

async function createRefreshToken(userId: string, ctx: RequestContext): Promise<string> {
  const raw = generateRefreshToken();
  await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash: hashRefreshToken(raw),
      expiresAt: refreshTokenExpiry(),
      userAgent: ctx.userAgent,
      ip: ctx.ip,
    },
  });
  return raw;
}

async function issueTokens(user: User, ctx: RequestContext): Promise<AuthResult> {
  const accessToken = await signAccessToken({ userId: user.id, role: user.role });
  const refreshToken = await createRefreshToken(user.id, ctx);
  return { user, accessToken, refreshToken };
}

/** Self-service registration. Always creates a STUDENT; elevation is admin-only. */
export async function register(input: RegisterInput, ctx: RequestContext): Promise<AuthResult> {
  const passwordHash = await hashPassword(input.password);
  let user: User;
  try {
    user = await prisma.user.create({
      data: {
        email: input.email,
        passwordHash,
        displayName: input.displayName,
        role: Role.STUDENT,
      },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new ConflictError('An account with this email already exists');
    }
    throw err;
  }
  return issueTokens(user, ctx);
}

export async function login(input: LoginInput, ctx: RequestContext): Promise<AuthResult> {
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  // Same response whether the email is unknown or the password is wrong.
  if (!user || !(await verifyPassword(user.passwordHash, input.password))) {
    throw new UnauthorizedError('Invalid email or password');
  }
  if (!user.isActive) {
    throw new ForbiddenError('Account is disabled');
  }
  return issueTokens(user, ctx);
}

/**
 * Rotate a refresh token: revoke the presented one and issue its successor.
 * Presenting an already-revoked token is treated as theft — the whole active
 * token family for that user is revoked.
 */
export async function refresh(rawToken: string, ctx: RequestContext): Promise<AuthResult> {
  const tokenHash = hashRefreshToken(rawToken);
  const existing = await prisma.refreshToken.findUnique({
    where: { tokenHash },
    include: { user: true },
  });
  if (!existing) {
    throw new UnauthorizedError('Invalid refresh token');
  }

  const now = new Date();
  if (existing.revokedAt !== null) {
    logger.warn({ userId: existing.userId, tokenId: existing.id }, 'refresh token reuse detected');
    await prisma.refreshToken.updateMany({
      where: { userId: existing.userId, revokedAt: null },
      data: { revokedAt: now },
    });
    throw new UnauthorizedError('Refresh token has been revoked');
  }
  if (existing.expiresAt.getTime() <= now.getTime()) {
    throw new UnauthorizedError('Refresh token expired');
  }
  if (!existing.user.isActive) {
    throw new ForbiddenError('Account is disabled');
  }

  const newRaw = generateRefreshToken();
  await prisma.$transaction(async (tx) => {
    const created = await tx.refreshToken.create({
      data: {
        userId: existing.userId,
        tokenHash: hashRefreshToken(newRaw),
        expiresAt: refreshTokenExpiry(now),
        userAgent: ctx.userAgent,
        ip: ctx.ip,
      },
    });
    await tx.refreshToken.update({
      where: { id: existing.id },
      data: { revokedAt: now, replacedById: created.id },
    });
  });

  const accessToken = await signAccessToken({
    userId: existing.userId,
    role: existing.user.role,
  });
  return { user: existing.user, accessToken, refreshToken: newRaw };
}

/** Revoke a specific refresh token (idempotent — unknown tokens are ignored). */
export async function logout(rawToken: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { tokenHash: hashRefreshToken(rawToken), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
