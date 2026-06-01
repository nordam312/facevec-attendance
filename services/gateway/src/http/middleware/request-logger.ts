import { randomUUID } from 'node:crypto';
import { pinoHttp } from 'pino-http';
import { logger } from '../../observability/logger.js';

/**
 * Per-request logging. Assigns/propagates an `x-request-id`, attaches a child
 * logger as `req.log` (carrying that id), and emits one completion line per
 * request at a status-appropriate level.
 */
export const requestLogger = pinoHttp({
  logger,
  genReqId: (req, res) => {
    const header = req.headers['x-request-id'];
    const id = (Array.isArray(header) ? header[0] : header) || randomUUID();
    res.setHeader('x-request-id', id);
    return id;
  },
  customLogLevel: (_req, res, err) => {
    if (err || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
});
