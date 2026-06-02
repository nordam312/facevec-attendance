import type { Logger } from 'pino';
import type { Role } from '../domain/index.js';
import type { UserId } from '../domain/index.js';

/** The authenticated principal attached to a request by `authenticate`. */
export interface AuthContext {
  userId: UserId;
  role: Role;
  /** Access-token id, for per-token revocation on logout. */
  jti: string;
  /** Access-token expiry (epoch seconds). */
  expiresAt: number;
}

/** Validated request parts produced by the `validate` middleware. */
export interface ValidatedRequest {
  body?: unknown;
  params?: unknown;
  query?: unknown;
}

// Augment Express' Request with the auth context and validated payloads.
// `req.log` / `req.id` are already contributed by `pino-http`.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthContext;
      valid?: ValidatedRequest;
      /** Request id assigned by the request logger (also echoed as a header). */
      id: string;
      /** Child logger carrying the request id; contributed by `pino-http`. */
      log: Logger;
    }
  }
}
