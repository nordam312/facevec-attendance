import type { RefreshTokenId, UserId } from './ids.js';

/**
 * A persisted refresh token. The raw token is shown to the client exactly once;
 * only its hash is stored, so a database leak cannot mint sessions. Rotation is
 * modelled by `replacedById`: refreshing revokes the current token and links it
 * to its successor, so presenting an already-rotated token is detectable reuse.
 */
export interface RefreshToken {
  id: RefreshTokenId;
  userId: UserId;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  replacedById: RefreshTokenId | null;
  userAgent: string | null;
  ip: string | null;
  createdAt: Date;
}

/** A refresh token is usable only while unrevoked and unexpired. */
export function isRefreshTokenActive(token: RefreshToken, now: Date = new Date()): boolean {
  return token.revokedAt === null && token.expiresAt.getTime() > now.getTime();
}

/**
 * Reuse of a revoked-and-rotated token is the canonical signal of theft: the
 * legitimate holder rotated it, so whoever presents it now is replaying a
 * stolen copy. Phase 2 responds by revoking the entire rotation chain.
 */
export function isReuseAttempt(token: RefreshToken): boolean {
  return token.revokedAt !== null && token.replacedById !== null;
}
