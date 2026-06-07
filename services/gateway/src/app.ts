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
import { metricsHandler, metricsMiddleware } from './observability/metrics.js';
import { apiRouter } from './routes.js';

/**
 * Build the Express application. Middleware order matters:
 *   request logging → security headers → CORS → body/cookie parsing →
 *   health probes → rate-limited API → 404 → central error handler.
 */
export function createApp(): Express {
  const app = express();

  // Behind one reverse-proxy hop (compose / ingress) — trust it for `req.ip`.
  app.set('trust proxy', 1);//here becuse we are behind a reverse proxy (nginx in production, vite dev server in development) we want to trust the X-Forwarded-For header to get the correct client IP address for logging and rate limiting
  app.disable('x-powered-by'); // herewe hide that we use Express, for slightly better security through obscurity

  app.use(requestLogger);
  app.use(metricsMiddleware);
  app.use(helmet());
  app.use(cors({ origin: config.CORS_ORIGINS, credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  // Probes and metrics are unauthenticated and outside the rate limiter.
  app.use(healthRouter);
  app.get('/metrics', metricsHandler);

  app.use('/api/v1', globalRateLimit, apiRouter);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
