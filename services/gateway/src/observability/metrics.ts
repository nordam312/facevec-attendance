import type { RequestHandler } from 'express';
import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from 'prom-client';
import { prisma } from '../db/prisma.js';
import { asyncHandler } from '../http/async-handler.js';

/** Prometheus registry. Default process metrics + custom application metrics. */
export const registry = new Registry();
collectDefaultMetrics({ register: registry });

const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status_code'] as const,
  buckets: [0.005, 0.01, 0.05, 0.1, 0.3, 0.5, 1, 2, 5],
  registers: [registry],
});

const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'route', 'status_code'] as const,
  registers: [registry],
});

/** Identification outcomes (result = matched | unmatched). */
export const identifyTotal = new Counter({
  name: 'facevec_identify_total',
  help: 'Face identification attempts by outcome',
  labelNames: ['result'] as const,
  registers: [registry],
});

/** AI circuit-breaker state: 0=closed, 1=half-open, 2=open. */
export const aiBreakerState = new Gauge({
  name: 'facevec_ai_breaker_state',
  help: 'AI circuit-breaker state (0=closed, 1=half-open, 2=open)',
  registers: [registry],
});

// Point-in-time gauge of un-published outbox rows, sampled on scrape.
new Gauge({
  name: 'facevec_outbox_pending_messages',
  help: 'Number of PENDING outbox messages awaiting publication',
  registers: [registry],
  async collect() {
    try {
      this.set(await prisma.outboxMessage.count({ where: { status: 'PENDING' } }));
    } catch {
      /* keep the last value if the DB is unreachable */
    }
  },
});

/** Records duration + count for every request, labelled by matched route. */
export const metricsMiddleware: RequestHandler = (req, res, next) => {
  const endTimer = httpRequestDuration.startTimer();
  res.on('finish', () => {
    // Use the matched route pattern (e.g. /api/v1/courses/:id) to bound cardinality.
    const route = req.route ? `${req.baseUrl}${req.route.path}` : 'unmatched';
    const labels = { method: req.method, route, status_code: String(res.statusCode) };
    endTimer(labels);
    httpRequestsTotal.inc(labels);
  });
  next();
};

/** GET /metrics — Prometheus exposition format (unauthenticated). */
export const metricsHandler: RequestHandler = asyncHandler(async (_req, res) => {
  res.set('Content-Type', registry.contentType);
  res.end(await registry.metrics());
});
