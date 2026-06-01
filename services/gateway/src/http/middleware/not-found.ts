import type { RequestHandler } from 'express';
import { NotFoundError } from '../../errors/index.js';

/** Terminal middleware: any unmatched route becomes a 404. */
export const notFound: RequestHandler = (req, _res, next) => {
  next(new NotFoundError(`Route not found: ${req.method} ${req.originalUrl}`));
};
