/**
 * Application error hierarchy. Every operational failure the API can return is
 * an `HttpError` carrying an HTTP status, a stable machine-readable `code`, and
 * an optional `details` payload. The central error handler serializes these
 * directly; anything that is *not* an `HttpError` is treated as an unexpected
 * fault (logged with a stack, reported to the client as a generic 500).
 */

export type ErrorDetails = Record<string, unknown> | unknown[];

export class HttpError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details: ErrorDetails | undefined;
  /** Whether this is an expected/operational error (vs. a programmer bug). */
  readonly isOperational = true;

  constructor(statusCode: number, code: string, message: string, details?: ErrorDetails) {
    super(message);
    this.name = new.target.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Error.captureStackTrace?.(this, new.target);
  }
}

export class BadRequestError extends HttpError {
  constructor(message = 'Bad request', details?: ErrorDetails) {
    super(400, 'bad_request', message, details);
  }
}

export class ValidationError extends HttpError {
  constructor(message = 'Validation failed', details?: ErrorDetails) {
    super(422, 'validation_error', message, details);
  }
}

export class UnauthorizedError extends HttpError {
  constructor(message = 'Authentication required', details?: ErrorDetails) {
    super(401, 'unauthorized', message, details);
  }
}

export class ForbiddenError extends HttpError {
  constructor(message = 'Insufficient permissions', details?: ErrorDetails) {
    super(403, 'forbidden', message, details);
  }
}

export class NotFoundError extends HttpError {
  constructor(message = 'Resource not found', details?: ErrorDetails) {
    super(404, 'not_found', message, details);
  }
}

export class ConflictError extends HttpError {
  constructor(message = 'Resource conflict', details?: ErrorDetails) {
    super(409, 'conflict', message, details);
  }
}

export class TooManyRequestsError extends HttpError {
  constructor(message = 'Too many requests', details?: ErrorDetails) {
    super(429, 'rate_limited', message, details);
  }
}
