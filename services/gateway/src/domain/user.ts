import type { Role } from './role.js';
import type { UserId } from './ids.js';

/** A platform principal, exactly as persisted in `users`. */
export interface User {
  id: UserId;
  email: string;
  /** Argon2id hash of the password — never the plaintext. */
  passwordHash: string;
  role: Role;
  displayName: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/** A `User` safe to serialize to clients (credential material stripped). */
export type PublicUser = Omit<User, 'passwordHash'>;

/** Project a `User` down to its client-facing shape. */
export function toPublicUser(user: User): PublicUser {
  const { passwordHash: _passwordHash, ...rest } = user;
  return rest;
}
