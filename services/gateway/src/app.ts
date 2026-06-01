import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { config } from './config/env.js';
import { healthRouter } from './health/health.routes.js';
import { errorHandler } from './http/middleware/error-handler.js';
import { notFound } from './http/middleware/not-found.js';
import { globalRateLimit } from './http/middleware/rate-limit.js';
import { requestLogger } from './http/middleware/request-logger.js';
import { apiRouter } from './routes.js';

/**
 * Build the Express application. Middleware order matters:
 *   request logging → security headers → CORS → body/cookie parsing →
 *   health probes → rate-limited API → 404 → central error handler.
 */
export function createApp(): Express {
  const app = express();

  // Behind one reverse-proxy hop (compose / ingress) — trust it for `req.ip`.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(requestLogger);
  app.use(helmet());
  app.use(cors({ origin: config.CORS_ORIGINS, credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  // Probes are intentionally unauthenticated and outside the rate limiter.
  app.use(healthRouter);

  app.use('/api/v1', globalRateLimit, apiRouter);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
