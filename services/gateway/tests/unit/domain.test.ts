import { describe, expect, it } from 'vitest';
import { EMBEDDING_DIMENSIONS } from '../../src/domain/constants.js';
import {
  EmbeddingDimensionError,
  assertEmbeddingDimensions,
  cosineSimilarity,
  isEmbedding,
  isMatch,
} from '../../src/domain/face-embedding.js';
import { Capability, Role, can, capabilitiesOf, isRole } from '../../src/domain/role.js';
import { InvalidUuidError, UserId, isUuid } from '../../src/domain/ids.js';
import { isRefreshTokenActive, isReuseAttempt, type RefreshToken } from '../../src/domain/auth.js';
import { SessionStatus, isSessionOpen, type AttendanceSession } from '../../src/domain/attendance.js';

const vec = (fill: (i: number) => number): number[] => Array.from({ length: EMBEDDING_DIMENSIONS }, (_, i) => fill(i));

describe('cosineSimilarity', () => {
  it('is 1 for identical vectors', () => {
    const a = vec((i) => (i % 7) + 1);
    expect(cosineSimilarity(a, a)).toBeCloseTo(1, 6);
  });

  it('is 0 for orthogonal vectors', () => {
    const a = vec((i) => (i % 2 === 0 ? 1 : 0));
    const b = vec((i) => (i % 2 === 0 ? 0 : 1));
    expect(cosineSimilarity(a, b)).toBeCloseTo(0, 6);
  });

  it('is -1 for opposite vectors', () => {
    const a = vec((i) => i + 1);
    const b = a.map((x) => -x);
    expect(cosineSimilarity(a, b)).toBeCloseTo(-1, 6);
  });

  it('throws when lengths differ', () => {
    expect(() => cosineSimilarity([1, 2, 3], [1, 2])).toThrow(EmbeddingDimensionError);
  });
});

describe('isMatch', () => {
  it('accepts at/above threshold and rejects below', () => {
    expect(isMatch(0.8, 0.75)).toBe(true);
    expect(isMatch(0.75, 0.75)).toBe(true);
    expect(isMatch(0.74, 0.75)).toBe(false);
  });
});

describe('embedding validation', () => {
  it('isEmbedding requires the exact dimensionality and finite numbers', () => {
    expect(isEmbedding(vec(() => 0.1))).toBe(true);
    expect(isEmbedding([1, 2, 3])).toBe(false);
    expect(isEmbedding(vec((i) => (i === 0 ? Number.NaN : 1)))).toBe(false);
  });

  it('assertEmbeddingDimensions throws on the wrong length', () => {
    expect(() => assertEmbeddingDimensions([1, 2, 3])).toThrow(EmbeddingDimensionError);
    expect(() => assertEmbeddingDimensions(vec(() => 0))).not.toThrow();
  });
});

describe('RBAC', () => {
  it('grants admin user management; professor lacks it', () => {
    expect(can(Role.ADMIN, Capability.MANAGE_USERS)).toBe(true);
    expect(can(Role.PROFESSOR, Capability.MANAGE_USERS)).toBe(false);
    expect(can(Role.PROFESSOR, Capability.RUN_ATTENDANCE)).toBe(true);
    expect(can(Role.STUDENT, Capability.VIEW_OWN_ATTENDANCE)).toBe(true);
    expect(can(Role.STUDENT, Capability.MANAGE_OWN_COURSES)).toBe(false);
  });

  it('capabilitiesOf returns a defensive copy', () => {
    const caps = capabilitiesOf(Role.ADMIN);
    expect(caps).toContain(Capability.MANAGE_USERS);
    caps.length = 0;
    expect(capabilitiesOf(Role.ADMIN).length).toBeGreaterThan(0);
  });

  it('isRole guards unknown values', () => {
    expect(isRole('ADMIN')).toBe(true);
    expect(isRole('SUPERUSER')).toBe(false);
    expect(isRole(42)).toBe(false);
  });
});

describe('branded ids', () => {
  it('accepts a valid UUID and rejects garbage', () => {
    const id = '11111111-1111-4111-8111-111111111111';
    expect(isUuid(id)).toBe(true);
    expect(UserId(id)).toBe(id);
    expect(() => UserId('not-a-uuid')).toThrow(InvalidUuidError);
  });
});

describe('refresh token rules', () => {
  const base: RefreshToken = {
    id: '11111111-1111-4111-8111-111111111111' as RefreshToken['id'],
    userId: '22222222-2222-4222-8222-222222222222' as RefreshToken['userId'],
    tokenHash: 'hash',
    expiresAt: new Date(Date.now() + 60_000),
    revokedAt: null,
    replacedById: null,
    userAgent: null,
    ip: null,
    createdAt: new Date(),
  };

  it('is active when unrevoked and unexpired', () => {
    expect(isRefreshTokenActive(base)).toBe(true);
  });
  it('is inactive when revoked', () => {
    expect(isRefreshTokenActive({ ...base, revokedAt: new Date() })).toBe(false);
  });
  it('is inactive when expired', () => {
    expect(isRefreshTokenActive({ ...base, expiresAt: new Date(Date.now() - 1000) })).toBe(false);
  });
  it('detects reuse of a rotated token', () => {
    expect(isReuseAttempt({ ...base, revokedAt: new Date(), replacedById: base.id })).toBe(true);
    expect(isReuseAttempt(base)).toBe(false);
  });
});

describe('session rules', () => {
  const session: AttendanceSession = {
    id: '33333333-3333-4333-8333-333333333333' as AttendanceSession['id'],
    courseId: '44444444-4444-4444-8444-444444444444' as AttendanceSession['courseId'],
    createdById: '55555555-5555-4555-8555-555555555555' as AttendanceSession['createdById'],
    status: SessionStatus.OPEN,
    startedAt: new Date(),
    endedAt: null,
  };

  it('is open only when OPEN and not ended', () => {
    expect(isSessionOpen(session)).toBe(true);
    expect(isSessionOpen({ ...session, status: SessionStatus.CLOSED })).toBe(false);
    expect(isSessionOpen({ ...session, endedAt: new Date() })).toBe(false);
  });
});
