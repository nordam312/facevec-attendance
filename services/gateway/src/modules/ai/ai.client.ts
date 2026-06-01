import { Buffer } from 'node:buffer';
import { config } from '../../config/env.js';

/**
 * HTTP client for the stateless AI inference service. The gateway sends an image
 * and receives 512-d embeddings; persistence and pgvector search stay here.
 * Phase 6 wraps this call in an opossum circuit breaker with a fallback queue.
 */

export interface DetectedFace {
  embedding: number[];
  bbox: number[];
  det_score: number;
  area: number;
}

export interface EmbeddingResult {
  model: string;
  dimensions: number;
  faceCount: number;
  faces: DetectedFace[];
  primary: DetectedFace | null;
}

/** The AI service is unreachable / timed out (network-level failure). */
export class AiUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AiUnavailableError';
  }
}

/** The AI service responded, but with an error status or unusable body. */
export class AiBadResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AiBadResponseError';
  }
}

interface RawEmbeddingResponse {
  model: string;
  dimensions: number;
  face_count: number;
  faces: DetectedFace[];
  primary: DetectedFace | null;
}

function baseUrl(): string {
  if (!config.AI_INFERENCE_URL) {
    throw new AiUnavailableError('AI_INFERENCE_URL is not configured');
  }
  return config.AI_INFERENCE_URL;
}

export async function extractEmbeddings(
  image: Buffer,
  filename: string,
  mimetype: string,
): Promise<EmbeddingResult> {
  const url = `${baseUrl()}/v1/embeddings`;

  const form = new FormData();
  form.append('file', new Blob([image], { type: mimetype }), filename || 'upload');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.AI_INFERENCE_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url, { method: 'POST', body: form, signal: controller.signal });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new AiUnavailableError(`AI inference request failed: ${reason}`);
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new AiBadResponseError(`AI inference returned ${response.status}: ${detail.slice(0, 200)}`);
  }

  let body: RawEmbeddingResponse;
  try {
    body = (await response.json()) as RawEmbeddingResponse;
  } catch {
    throw new AiBadResponseError('AI inference returned a non-JSON body');
  }

  return {
    model: body.model,
    dimensions: body.dimensions,
    faceCount: body.face_count,
    faces: body.faces,
    primary: body.primary ?? null,
  };
}
