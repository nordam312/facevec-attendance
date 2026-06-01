import type { Request } from 'express';
import { UnauthorizedError } from '../errors/index.js';
import type { AuthContext } from './types.js';

/**
 * Retrieve the authenticated principal, asserting it is present. Use in
 * handlers mounted behind `authenticate` to get a non-nullable `AuthContext`.
 */
export function actorOf(req: Request): AuthContext {
  if (!req.auth) {
    throw new UnauthorizedError();
  }
  return req.auth;
}
