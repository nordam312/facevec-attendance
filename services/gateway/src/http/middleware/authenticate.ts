import type { RequestHandler } from 'express';
import { UserId } from '../../domain/index.js';
import { UnauthorizedError } from '../../errors/index.js';
import { verifyAccessToken } from '../../modules/auth/token.service.js';
import { asyncHandler } from '../async-handler.js';

/**
 * Require a valid `Authorization: Bearer <jwt>` header. On success the decoded
 * principal is attached as `req.auth`; on failure the request is rejected 401.
 */
export const authenticate: RequestHandler = asyncHandler(async (req, _res, next) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    throw new UnauthorizedError('Missing bearer token');
  }
  const token = header.slice('Bearer '.length).trim();
  if (!token) {
    throw new UnauthorizedError('Missing bearer token');
  }
  const claims = await verifyAccessToken(token);
  req.auth = { userId: UserId(claims.userId), role: claims.role };
  next();
});
