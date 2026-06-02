import type { Request, RequestHandler } from 'express';
import { UserId } from '../../domain/index.js';
import { UnauthorizedError } from '../../errors/index.js';
import { verifyAccessToken } from '../../modules/auth/token.service.js';
import { isAccessTokenRevoked, userTokenCutoff } from '../../redis/token-revocation.js';
import { asyncHandler } from '../async-handler.js';
import type { AuthContext } from '../types.js';

function bearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return null;
  const token = header.slice('Bearer '.length).trim();
  return token || null;
}

/** Verify the access token and reject it if it has been revoked (Redis). */
async function resolveAuth(token: string): Promise<AuthContext> {
  const claims = await verifyAccessToken(token);

  if (await isAccessTokenRevoked(claims.jti)) {
    throw new UnauthorizedError('Token has been revoked');
  }
  const cutoff = await userTokenCutoff(claims.userId);
  if (cutoff !== null && claims.issuedAt < cutoff) {
    throw new UnauthorizedError('Session has been revoked');
  }

  return {
    userId: UserId(claims.userId),
    role: claims.role,
    jti: claims.jti,
    expiresAt: claims.expiresAt,
  };
}

/**
 * Require a valid `Authorization: Bearer <jwt>` header. On success the decoded
 * principal is attached as `req.auth`; on failure the request is rejected 401.
 */
export const authenticate: RequestHandler = asyncHandler(async (req, _res, next) => {
  const token = bearerToken(req);
  if (!token) {
    throw new UnauthorizedError('Missing bearer token');
  }
  req.auth = await resolveAuth(token);
  next();
});

/**
 * Attach `req.auth` when a valid token is present, but never reject. For routes
 * (like logout) that should work with or without credentials.
 */
export const optionalAuthenticate: RequestHandler = asyncHandler(async (req, _res, next) => {
  const token = bearerToken(req);
  if (token) {
    try {
      req.auth = await resolveAuth(token);
    } catch {
      // Ignore invalid/expired tokens for optional auth.
    }
  }
  next();
});
