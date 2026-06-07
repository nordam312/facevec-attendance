import { pino } from 'pino';
import { trace } from '@opentelemetry/api';
import { config } from '../config/env.js';

/** Correlate every log line with the active span (when tracing is enabled). */
function traceContext(): Record<string, string> {
  const span = trace.getActiveSpan();
  if (!span) return {};
  const ctx = span.spanContext();
  return { trace_id: ctx.traceId, span_id: ctx.spanId };
}

/**
 * Process-wide structured logger. JSON in production (machine-ingestable);
 * pretty-printed in development for readability. Per-request child loggers are
 * created by `pino-http` (see the request-logging middleware) and carry the
 * request id; a mixin adds the OpenTelemetry trace/span ids so logs correlate
 * to distributed traces.
 */
export const logger = pino({
  level: config.LOG_LEVEL,
  mixin: traceContext,
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
