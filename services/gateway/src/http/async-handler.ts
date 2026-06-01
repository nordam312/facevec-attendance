import type { NextFunction, Request, RequestHandler, Response } from 'express';

type AsyncHandler = (req: Request, res: Response, next: NextFunction) => Promise<unknown>;

/**
 * Adapt an async handler to Express. Express 5 forwards rejected promises to
 * the error middleware on its own, but wrapping keeps the contract explicit and
 * the handler signatures clean (`async (req, res) => { ... }` with no `next`).
 */
export function asyncHandler(handler: AsyncHandler): RequestHandler {
  return (req, res, next) => {
    handler(req, res, next).catch(next);
  };
}
