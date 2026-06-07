import process from 'node:process';
import { createApp } from './app.js';
import { config } from './config/env.js';
import { prisma } from './db/prisma.js';
import { rabbit } from './messaging/rabbitmq.js';
import { outboxRelay } from './messaging/outbox-relay.js';
import { faceTaskConsumer } from './messaging/face-task-consumer.js';
import { closeRedis, initRedis } from './redis/redis.js';
import { attachWebSocketServer } from './ws/ws-server.js';
import { closeBroadcaster, initBroadcaster } from './ws/broadcaster.js';
import { notificationsConsumer } from './ws/notifications-consumer.js';
import { logger } from './observability/logger.js';

/**
 * Gateway bootstrap. Builds the Express app, starts listening, connects to the
 * broker, starts the outbox relay + consumers, and installs a graceful-shutdown
 * handler. Loaded *after* the tracing bootstrap (see index.ts) so OpenTelemetry
 * instrumentations can patch the modules imported here.
 */

const SHUTDOWN_GRACE_MS = 10_000;

const app = createApp();
const server = app.listen(config.PORT, () => {
  logger.info({ port: config.PORT, env: config.NODE_ENV }, 'gateway listening');
});

// Live attendance feed: WebSocket server on the same HTTP server.
const wss = attachWebSocketServer(server);

// Connect to Redis (idempotency, shared rate-limit, token revocation, WS
// fan-out) and the broker; start the relay and consumers. None block startup —
// all degrade gracefully.
initRedis();
initBroadcaster();
faceTaskConsumer.start();
notificationsConsumer.start();
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
  wss.close();

  server.close(() => {
    Promise.allSettled([closeBroadcaster(), rabbit.close(), closeRedis(), prisma.$disconnect()])
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
