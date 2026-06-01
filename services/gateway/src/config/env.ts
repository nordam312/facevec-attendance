import process from 'node:process';
import { z } from 'zod';

/**
 * Environment configuration, validated once at startup. Importing `config`
 * anywhere guarantees a fully-typed, validated settings object; a missing or
 * malformed variable fails the process fast with a readable report rather than
 * surfacing as an `undefined` deep in a request handler.
 */

const csv = z
  .string()
  .transform((value) => value.split(',').map((s) => s.trim()).filter(Boolean));

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),
  PORT: z.coerce.number().int().positive().default(8080),

  // Connection strings. Only Postgres is consumed in Phase 2; the rest are
  // wired by their respective phases and are optional until then.
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url().optional(),
  RABBITMQ_URL: z.string().url().optional(),
  AI_INFERENCE_URL: z.string().url().optional(),

  // Auth. Secrets must be long enough to resist brute force; TTLs are seconds.
  JWT_ACCESS_SECRET: z.string().min(16, 'JWT_ACCESS_SECRET must be at least 16 characters'),
  JWT_REFRESH_SECRET: z.string().min(16, 'JWT_REFRESH_SECRET must be at least 16 characters'),
  JWT_ACCESS_TTL: z.coerce.number().int().positive().default(900),
  JWT_REFRESH_TTL: z.coerce.number().int().positive().default(1_209_600),

  CORS_ORIGINS: csv.default('http://localhost:3000'),

  // Identification acceptance threshold (consumed from Phase 4 onward).
  FACE_MATCH_THRESHOLD: z.coerce.number().min(0).max(1).default(0.75),

  // Transactional-outbox relay tuning.
  OUTBOX_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(1000),
  OUTBOX_BATCH_SIZE: z.coerce.number().int().positive().max(500).default(50),
  OUTBOX_MAX_ATTEMPTS: z.coerce.number().int().positive().default(10),
});

export type AppConfig = Readonly<z.infer<typeof envSchema>> & {
  readonly isProduction: boolean;
  readonly isDevelopment: boolean;
};

function loadConfig(): AppConfig {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  const env = parsed.data;
  return Object.freeze({
    ...env,
    isProduction: env.NODE_ENV === 'production',
    isDevelopment: env.NODE_ENV === 'development',
  });
}

export const config: AppConfig = loadConfig();
