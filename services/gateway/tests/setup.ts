import { existsSync } from 'node:fs';
import process from 'node:process';

// Load the local .env when present (developer machine); CI injects env directly.
if (existsSync('.env')) {
  try {
    process.loadEnvFile('.env');
  } catch {
    /* ignore */
  }
}

process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';
process.env.JWT_ACCESS_SECRET ??= 'test-access-secret-0123456789-abcdefgh';
process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret-0123456789-abcdefgh';
// Relax rate limits so test suites are not throttled (override any .env value).
process.env.RATE_LIMIT_AUTH = '100000';
process.env.RATE_LIMIT_GLOBAL = '100000';

// The integration tests exercise the HTTP app against Postgres only — Redis and
// RabbitMQ are unset so the app uses the in-memory rate limiter and the outbox
// simply accumulates rows (no relay/broker needed at request time). Their
// behaviour is covered by the Phase 5/6 live tests.
delete process.env.REDIS_URL;
delete process.env.RABBITMQ_URL;
