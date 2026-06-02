import { getRedis, isRedisReady } from './redis.js';

/**
 * Access-token revocation backed by Redis. Access tokens are stateless JWTs, so
 * without this they remain valid until they expire. Two mechanisms:
 *   - per-token denylist (logout)  — keyed by the token's `jti`.
 *   - per-user cutoff (logout-all) — reject tokens issued before a timestamp.
 * Both fail open: if Redis is unavailable the checks are skipped (tokens are
 * short-lived, so the exposure window is bounded).
 */

const JTI_PREFIX = 'revoke:jti:';
const USER_PREFIX = 'revoke:user:';

export async function revokeAccessToken(jti: string, ttlSeconds: number): Promise<void> {
  const redis = getRedis();
  if (!redis || !isRedisReady()) return;
  await redis.set(JTI_PREFIX + jti, '1', 'EX', Math.max(1, Math.ceil(ttlSeconds)));
}

export async function isAccessTokenRevoked(jti: string): Promise<boolean> {
  const redis = getRedis();
  if (!redis || !isRedisReady()) return false;
  return (await redis.exists(JTI_PREFIX + jti)) === 1;
}

/** Revoke every access token for a user issued at or before `cutoffSeconds`. */
export async function revokeUserTokensBefore(
  userId: string,
  cutoffSeconds: number,
  ttlSeconds: number,
): Promise<void> {
  const redis = getRedis();
  if (!redis || !isRedisReady()) return;
  await redis.set(USER_PREFIX + userId, String(cutoffSeconds), 'EX', Math.max(1, Math.ceil(ttlSeconds)));
}

/** The cutoff (epoch seconds) before which a user's tokens are invalid, if any. */
export async function userTokenCutoff(userId: string): Promise<number | null> {
  const redis = getRedis();
  if (!redis || !isRedisReady()) return null;
  const value = await redis.get(USER_PREFIX + userId);
  return value !== null ? Number(value) : null;
}
