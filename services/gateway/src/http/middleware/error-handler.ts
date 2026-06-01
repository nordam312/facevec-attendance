import type { ErrorRequestHandler } from 'express';
import { Prisma } from '@prisma/client';
import { config } from '../../config/env.js';
import {
  BadRequestError,
  ConflictError,
  HttpError,
  NotFoundError,
} from '../../errors/index.js';

/** Translate known Prisma engine errors into our HTTP error vocabulary. */
function mapPrismaError(err: Prisma.PrismaClientKnownRequestError): HttpError {
  switch (err.code) {
    case 'P2002': {
      // Unique constraint violation.
      const target = (err.meta as { target?: string[] } | undefined)?.target;
      return new ConflictError('A record with these values already exists', target ? { fields: target } : undefined);
    }
    case 'P2025':
      // Required record not found (e.g. update/delete of a missing row).
      return new NotFoundError('The requested record does not exist');
    case 'P2003':
      // Foreign-key constraint failed.
      return new BadRequestError('Related record does not exist or is still referenced');
    default:
      return new BadRequestError('Database request could not be processed');
  }
}

/**
 * Central error handler. `HttpError`s (and mapped Prisma errors) are serialized
 * as `{ error: { code, message, details? }, requestId }`. Anything else is an
 * unexpected fault: logged with its stack and returned as an opaque 500.
 */
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const requestId = String(req.id ?? '');

  let httpError: HttpError | null = null;
  if (err instanceof HttpError) {
    httpError = err;
  } else if (err instanceof Prisma.PrismaClientKnownRequestError) {
    httpError = mapPrismaError(err);
  }

  if (httpError) {
    if (httpError.statusCode >= 500) {
      req.log.error({ err }, httpError.message);
    } else {
      req.log.warn({ code: httpError.code, statusCode: httpError.statusCode }, httpError.message);
    }
    res.status(httpError.statusCode).json({
      error: {
        code: httpError.code,
        message: httpError.message,
        ...(httpError.details !== undefined ? { details: httpError.details } : {}),
      },
      requestId,
    });
    return;
  }

  // Unexpected — never leak internals in production.
  req.log.error({ err }, 'unhandled error');
  res.status(500).json({
    error: {
      code: 'internal_error',
      message: config.isProduction
        ? 'An internal error occurred'
        : err instanceof Error
          ? err.message
          : String(err),
    },
    requestId,
  });
};
