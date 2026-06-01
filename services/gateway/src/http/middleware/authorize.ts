import type { RequestHandler } from 'express';
import { can, type Capability, type Role } from '../../domain/index.js';
import { ForbiddenError, UnauthorizedError } from '../../errors/index.js';

/**
 * Restrict a route to an explicit set of roles. Must run after `authenticate`.
 */
export function requireRole(...roles: readonly Role[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.auth) {
      next(new UnauthorizedError());
      return;
    }
    if (!roles.includes(req.auth.role)) {
      next(new ForbiddenError());
      return;
    }
    next();
  };
}

/**
 * Restrict a route by capability, consulting the domain role→capability map.
 * Preferred over `requireRole` so the policy lives in one place (domain/role).
 */
export function requireCapability(capability: Capability): RequestHandler {
  return (req, _res, next) => {
    if (!req.auth) {
      next(new UnauthorizedError());
      return;
    }
    if (!can(req.auth.role, capability)) {
      next(new ForbiddenError(`Missing required capability: ${capability}`));
      return;
    }
    next();
  };
}
