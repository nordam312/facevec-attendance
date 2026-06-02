import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import { config } from '../../config/env.js';
import { isRole, type Role } from '../../domain/index.js';
import { UnauthorizedError } from '../../errors/index.js';

/**
 * Token strategy:
 *   - Access token  — short-lived, stateless JWT (HS256). Carries the subject
 *     and role; verified on every request without a database hit.
 *   - Refresh token — long-lived, opaque random string. Only an HMAC of it is
 *     stored (peppered with JWT_REFRESH_SECRET), so a database leak alone can
 *     neither verify nor forge one. Rotated on every use (see auth.service).
 */

const ISSUER = 'facevec';
const AUDIENCE = 'facevec-api';
const accessSecret = new TextEncoder().encode(config.JWT_ACCESS_SECRET);

export interface AccessTokenInput {
  userId: string;
  role: Role;
}

/** Verified access-token claims, including identifiers used for revocation. */
export interface AccessTokenClaims {
  userId: string;
  role: Role;
  /** Unique token id — denylisted on logout. */
  jti: string;
  /** Issued-at (epoch seconds) — compared against the per-user revocation cutoff. */
  issuedAt: number;
  /** Expiry (epoch seconds) — bounds the denylist TTL. */
  expiresAt: number;
}

export async function signAccessToken(claims: AccessTokenInput): Promise<string> {
  return new SignJWT({ role: claims.role })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(claims.userId)
    .setJti(randomUUID())
    .setIssuedAt()
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setExpirationTime(`${config.JWT_ACCESS_TTL}s`)
    .sign(accessSecret);
}

export async function verifyAccessToken(token: string): Promise<AccessTokenClaims> {
  let payload;
  try {
    ({ payload } = await jwtVerify(token, accessSecret, { issuer: ISSUER, audience: AUDIENCE }));
  } catch {
    throw new UnauthorizedError('Invalid or expired access token');
  }
  const role = payload.role;
  if (
    typeof payload.sub !== 'string' ||
    !isRole(role) ||
    typeof payload.jti !== 'string' ||
    typeof payload.iat !== 'number' ||
    typeof payload.exp !== 'number'
  ) {
    throw new UnauthorizedError('Malformed access token');
  }
  return { userId: payload.sub, role, jti: payload.jti, issuedAt: payload.iat, expiresAt: payload.exp };
}

/** A fresh opaque refresh token (the raw value handed to the client once). */
export function generateRefreshToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Peppered HMAC-SHA256 of a refresh token — this is what we persist. */
export function hashRefreshToken(raw: string): string {
  return createHmac('sha256', config.JWT_REFRESH_SECRET).update(raw).digest('hex');
}

/** Absolute expiry for a newly-issued refresh token. */
export function refreshTokenExpiry(now: Date = new Date()): Date {
  return new Date(now.getTime() + config.JWT_REFRESH_TTL * 1000);
}

export const accessTtlSeconds = config.JWT_ACCESS_TTL;
export const refreshTtlSeconds = config.JWT_REFRESH_TTL;
