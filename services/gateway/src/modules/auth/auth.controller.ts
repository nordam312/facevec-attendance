import type { Response } from 'express';
import { config } from '../../config/env.js';
import { prisma } from '../../db/prisma.js';
import { UnauthorizedError } from '../../errors/index.js';
import { asyncHandler } from '../../http/async-handler.js';
import { serializeUser } from '../users/user.serializer.js';
import {
  login,
  logout,
  logoutAll,
  refresh,
  register,
  type AuthResult,
  type RequestContext,
} from './auth.service.js';
import type { LoginInput, RegisterInput } from './auth.schemas.js';
import { accessTtlSeconds, refreshTtlSeconds } from './token.service.js';

const REFRESH_COOKIE = 'refresh_token';
// Scope the cookie to the auth routes so it is only sent where it is consumed.
const REFRESH_COOKIE_PATH = '/api/v1/auth';

function setRefreshCookie(res: Response, token: string): void {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: 'lax',
    path: REFRESH_COOKIE_PATH,
    maxAge: refreshTtlSeconds * 1000,
  });
}

function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE, { path: REFRESH_COOKIE_PATH });
}

function contextFrom(req: { headers: Record<string, unknown>; ip?: string | undefined }): RequestContext {
  const ua = req.headers['user-agent'];
  return { userAgent: typeof ua === 'string' ? ua : null, ip: req.ip ?? null };
}

/** Set the refresh cookie and return the access token + user in the body. */
function sendAuthResult(res: Response, result: AuthResult, status: number): void {
  setRefreshCookie(res, result.refreshToken);
  res.status(status).json({
    accessToken: result.accessToken,
    tokenType: 'Bearer',
    expiresIn: accessTtlSeconds,
    user: serializeUser(result.user),
  });
}

export const registerHandler = asyncHandler(async (req, res) => {
  const result = await register(req.valid?.body as RegisterInput, contextFrom(req));
  sendAuthResult(res, result, 201);
});

export const loginHandler = asyncHandler(async (req, res) => {
  const result = await login(req.valid?.body as LoginInput, contextFrom(req));
  sendAuthResult(res, result, 200);
});

export const refreshHandler = asyncHandler(async (req, res) => {
  const token = req.cookies?.[REFRESH_COOKIE];
  if (typeof token !== 'string' || !token) {
    throw new UnauthorizedError('Missing refresh token');
  }
  const result = await refresh(token, contextFrom(req));
  sendAuthResult(res, result, 200);
});

export const logoutHandler = asyncHandler(async (req, res) => {
  const token = req.cookies?.[REFRESH_COOKIE];
  await logout({
    refreshToken: typeof token === 'string' && token ? token : null,
    ...(req.auth ? { access: { jti: req.auth.jti, expiresAt: req.auth.expiresAt } } : {}),
  });
  clearRefreshCookie(res);
  res.status(204).end();
});

export const logoutAllHandler = asyncHandler(async (req, res) => {
  if (!req.auth) {
    throw new UnauthorizedError();
  }
  await logoutAll(req.auth.userId, req.auth.jti, req.auth.expiresAt);
  clearRefreshCookie(res);
  res.status(204).end();
});

export const meHandler = asyncHandler(async (req, res) => {
  if (!req.auth) {
    throw new UnauthorizedError();
  }
  const user = await prisma.user.findUnique({ where: { id: req.auth.userId } });
  if (!user) {
    throw new UnauthorizedError();
  }
  res.json({ user: serializeUser(user) });
});
