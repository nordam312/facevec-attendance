import process from 'node:process';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { ExpressInstrumentation } from '@opentelemetry/instrumentation-express';
import { IORedisInstrumentation } from '@opentelemetry/instrumentation-ioredis';
import { AmqplibInstrumentation } from '@opentelemetry/instrumentation-amqplib';
import { UndiciInstrumentation } from '@opentelemetry/instrumentation-undici';

/**
 * OpenTelemetry tracing bootstrap. Loaded via `node --import` *before* the
 * application so its instrumentations can patch http/express/ioredis/amqplib and
 * outgoing fetch (undici). Tracing is enabled only when an OTLP endpoint is
 * configured; otherwise this is a no-op. Self-contained on purpose — it reads
 * `process.env` directly and avoids importing app modules (which would load
 * before instrumentation is registered).
 */
let sdk: NodeSDK | undefined;

const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
if (endpoint) {
  sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: process.env.OTEL_SERVICE_NAME ?? 'facevec-gateway',
      [ATTR_SERVICE_VERSION]: '0.1.0',
    }),
    traceExporter: new OTLPTraceExporter(),
    instrumentations: [
      new HttpInstrumentation(),
      new ExpressInstrumentation(),
      new IORedisInstrumentation(),
      new AmqplibInstrumentation(),
      new UndiciInstrumentation(),
    ],
  });
  sdk.start();
  process.stdout.write(`${JSON.stringify({ level: 'info', msg: 'opentelemetry tracing started', endpoint })}\n`);

  // Flush spans on shutdown. Self-registered here (rather than imported by the
  // app) so this module is only ever loaded once — via `--import`.
  const stop = (): void => {
    void sdk?.shutdown().catch(() => undefined);
  };
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);
}
