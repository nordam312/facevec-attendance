import process from 'node:process';
import { createApp } from './app.js';
import { config } from './config/env.js';
import { prisma } from './db/prisma.js';
import { rabbit } from './messaging/rabbitmq.js';
import { outboxRelay } from './messaging/outbox-relay.js';
import { logger } from './observability/logger.js';

/**
 * Gateway entrypoint. Builds the Express app, starts listening, connects to the
 * broker, starts the outbox relay, and installs a graceful-shutdown handler
 * that stops the relay, drains connections, and closes the broker + database.
 */

const SHUTDOWN_GRACE_MS = 10_000;

const app = createApp();
const server = app.listen(config.PORT, () => {
  logger.info({ port: config.PORT, env: config.NODE_ENV }, 'gateway listening');
});

// Connect to the broker (self-retrying) and start the relay. Neither blocks
// startup: if the broker is down, writes still succeed and buffer in the outbox.
void rabbit.connect();
outboxRelay.start();

let shuttingDown = false;
function shutdown(signal: NodeJS.Signals): void {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'received signal, draining connections');

  const forced = setTimeout(() => {
    logger.error('forced exit after grace period');
    process.exit(1);
  }, SHUTDOWN_GRACE_MS).unref();

  outboxRelay.stop();

  server.close(() => {
    Promise.allSettled([rabbit.close(), prisma.$disconnect()])
      .catch((err: unknown) => logger.error({ err }, 'error during shutdown'))
      .finally(() => {
        clearTimeout(forced);
        logger.info('shutdown complete');
        process.exit(0);
      });
  });
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
process.on('unhandledRejection', (reason) => {
  logger.error({ reason }, 'unhandled promise rejection');
});
process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'uncaught exception');
  process.exit(1);
});
