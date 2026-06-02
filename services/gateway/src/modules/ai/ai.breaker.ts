import type { Buffer } from 'node:buffer';
import CircuitBreaker from 'opossum';
import { config } from '../../config/env.js';
import { logger } from '../../observability/logger.js';
import {
  AiBadResponseError,
  AiUnavailableError,
  extractEmbeddings,
  type EmbeddingResult,
} from './ai.client.js';

/**
 * Circuit breaker around the AI inference HTTP call. When the AI service is
 * failing, the breaker trips OPEN and subsequent calls fail fast (no waiting on
 * timeouts, no hammering a sick service). After `resetTimeout` it goes HALF-OPEN
 * and lets one trial through. Enrollment degrades to the async fallback queue on
 * any AI failure; identification (real-time) surfaces a 503.
 */
const breaker = new CircuitBreaker(
  (image: Buffer, filename: string, mimetype: string): Promise<EmbeddingResult> =>
    extractEmbeddings(image, filename, mimetype),
  {
    name: 'ai-inference',
    timeout: config.AI_BREAKER_TIMEOUT_MS,
    errorThresholdPercentage: config.AI_BREAKER_ERROR_THRESHOLD,
    resetTimeout: config.AI_BREAKER_RESET_MS,
    volumeThreshold: config.AI_BREAKER_VOLUME_THRESHOLD,
  },
);

breaker.on('open', () => logger.warn('ai breaker OPEN — failing fast'));
breaker.on('halfOpen', () => logger.info('ai breaker HALF-OPEN — trial request'));
breaker.on('close', () => logger.info('ai breaker CLOSED — recovered'));

export type BreakerState = 'closed' | 'open' | 'half-open';

export function aiBreakerState(): BreakerState {
  if (breaker.opened) return 'open';
  if (breaker.halfOpen) return 'half-open';
  return 'closed';
}

export function extractViaBreaker(
  image: Buffer,
  filename: string,
  mimetype: string,
): Promise<EmbeddingResult> {
  return breaker.fire(image, filename, mimetype);
}

/**
 * True when an error means the AI path failed (transport error, bad response,
 * breaker open, or breaker timeout) — as opposed to a domain outcome like
 * "no face detected", which is a normal successful response.
 */
export function isAiFailure(err: unknown): boolean {
  if (err instanceof AiUnavailableError || err instanceof AiBadResponseError) {
    return true;
  }
  const code = (err as { code?: unknown } | null)?.code;
  return code === 'EOPENBREAKER' || code === 'ETIMEDOUT';
}
