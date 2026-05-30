import http from 'node:http';
import process from 'node:process';

/**
 * Phase 0 bootstrap server.
 *
 * This is a deliberately dependency-free `node:http` server whose only job is to
 * expose liveness (`/health`) and readiness (`/ready`) probes so the container
 * is observable from the very first phase. The full Express application —
 * routing, Zod validation, the auth / rate-limit / logging middleware stack —
 * replaces this entrypoint in Phase 2, and the readiness probe is upgraded to
 * verify Postgres / Redis / RabbitMQ connectivity.
 */

const SERVICE = 'gateway';
const PORT = Number.parseInt(process.env.PORT ?? '8080', 10);
const SHUTDOWN_GRACE_MS = 10_000;

function json(res: http.ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    json(res, 200, { status: 'ok', service: SERVICE, ts: new Date().toISOString() });
    return;
  }
  if (req.method === 'GET' && req.url === '/ready') {
    // Phase 2 replaces this with real dependency checks.
    json(res, 200, { status: 'ready', service: SERVICE });
    return;
  }
  json(res, 404, { error: 'not_found', path: req.url ?? null });
});

server.listen(PORT, () => {
  log('info', `listening on :${PORT}`);
});

function log(level: 'info' | 'error', msg: string): void {
  // Minimal structured line; replaced by pino in Phase 9.
  process.stdout.write(`${JSON.stringify({ level, service: SERVICE, ts: new Date().toISOString(), msg })}\n`);
}

function shutdown(signal: NodeJS.Signals): void {
  log('info', `received ${signal}, draining connections`);
  server.close(() => {
    log('info', 'closed cleanly');
    process.exit(0);
  });
  setTimeout(() => {
    log('error', 'forced exit after grace period');
    process.exit(1);
  }, SHUTDOWN_GRACE_MS).unref();
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
