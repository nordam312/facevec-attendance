/**
 * Domain layer barrel.
 *
 * Pure, framework-agnostic types and rules for the FaceVec domain — no Prisma,
 * no Express, no env access. Persistence (Phase 2) maps Prisma rows onto these
 * entities; nothing here may import from the data or transport layers.
 */

export * from './constants.js';
export * from './ids.js';
export * from './role.js';
export * from './user.js';
export * from './auth.js';
export * from './student.js';
export * from './face-embedding.js';
export * from './course.js';
export * from './attendance.js';
