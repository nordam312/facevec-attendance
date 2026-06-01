import { pino } from 'pino';
import { config } from '../config/env.js';

/**
 * Process-wide structured logger. JSON in production (machine-ingestable);
 * pretty-printed in development for readability. Per-request child loggers are
 * created by `pino-http` (see the request-logging middleware) and carry the
 * request id, so application logs can be correlated to a single request.
 *
 * Phase 9 layers OpenTelemetry trace/span ids onto these records.
 */
export const logger = pino({
  level: config.LOG_LEVEL,
  // Redact anything that could leak credentials or tokens from logged objects.
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'res.headers["set-cookie"]',
      '*.password',
      '*.passwordHash',
      '*.token',
      '*.refreshToken',
      '*.accessToken',
    ],
    censor: '[redacted]',
  },
  ...(config.isProduction
    ? {}
    : {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'SYS:HH:MM:ss.l', ignore: 'pid,hostname' },
        },
      }),
});
