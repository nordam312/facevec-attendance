/**
 * Process entrypoint. Tracing is started first (a static import, evaluated
 * before anything else); the server is then loaded with a dynamic import so its
 * modules — Express, ioredis, amqplib, undici — are imported *after* the
 * OpenTelemetry instrumentations have registered and can patch them. This avoids
 * the `--import`/`module.register` double-evaluation pitfall.
 */
import './observability/tracing.js';

await import('./server.js');
