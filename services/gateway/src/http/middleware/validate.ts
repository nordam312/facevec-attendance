import type { RequestHandler } from 'express';
import { ZodError, type ZodTypeAny } from 'zod';
import { ValidationError } from '../../errors/index.js';

export interface ValidationSchemas {
  body?: ZodTypeAny;
  params?: ZodTypeAny;
  query?: ZodTypeAny;
}

function formatIssues(error: ZodError): { field: string; message: string; code: string }[] {
  return error.issues.map((issue) => ({
    field: issue.path.join('.') || '(root)',
    message: issue.message,
    code: issue.code,
  }));
}

/**
 * Validate (and coerce) request parts against Zod schemas before the handler
 * runs. Results are stored on `req.valid` — Express 5 exposes `req.query` as a
 * read-only getter, so we never reassign the originals — and read back by
 * controllers with the matching `z.infer` type. A failure short-circuits to the
 * error handler as a 422 with per-field details.
 */
export function validate(schemas: ValidationSchemas): RequestHandler {
  return (req, _res, next) => {
    try {
      const valid: { body?: unknown; params?: unknown; query?: unknown } = {};
      if (schemas.body) valid.body = schemas.body.parse(req.body);
      if (schemas.params) valid.params = schemas.params.parse(req.params);
      if (schemas.query) valid.query = schemas.query.parse(req.query);
      req.valid = valid;
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        next(new ValidationError('Request validation failed', formatIssues(err)));
        return;
      }
      next(err);
    }
  };
}
