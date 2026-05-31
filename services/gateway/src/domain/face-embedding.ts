import { DEFAULT_EMBEDDING_MODEL, DEFAULT_FACE_MATCH_THRESHOLD, EMBEDDING_DIMENSIONS } from './constants.js';
import type { FaceEmbeddingId, StudentId } from './ids.js';

/** A fixed-length face embedding vector. Length is enforced at the boundary. */
export type Embedding = readonly number[];

/** A single enrolled embedding, as persisted in `face_embeddings`. */
export interface FaceEmbedding {
  id: FaceEmbeddingId;
  studentId: StudentId;
  /** The 512-d vector. Stored as pgvector; hydrated via raw SQL. */
  embedding: Embedding;
  /** InsightFace model pack that produced the vector (e.g. `buffalo_l`). */
  model: string;
  /** Detector confidence in [0, 1], or null when not captured. */
  quality: number | null;
  /** SHA-256 of the source image, for enrollment de-duplication. */
  sourceImageHash: string | null;
  createdAt: Date;
}

export class EmbeddingDimensionError extends RangeError {
  constructor(actual: number, expected: number = EMBEDDING_DIMENSIONS) {
    super(`embedding must have ${expected} dimensions, received ${actual}`);
    this.name = 'EmbeddingDimensionError';
  }
}

/** Narrowing guard: a finite-valued vector of the expected dimensionality. */
export function isEmbedding(value: unknown, dimensions: number = EMBEDDING_DIMENSIONS): value is Embedding {
  return (
    Array.isArray(value) &&
    value.length === dimensions &&
    value.every((n) => typeof n === 'number' && Number.isFinite(n))
  );
}

/** Assert `vector` has the expected dimensionality. @throws EmbeddingDimensionError */
export function assertEmbeddingDimensions(vector: Embedding, dimensions: number = EMBEDDING_DIMENSIONS): void {
  if (vector.length !== dimensions) {
    throw new EmbeddingDimensionError(vector.length, dimensions);
  }
}

/**
 * Cosine similarity in [-1, 1] between two equal-length vectors. Mirrors the
 * ranking Postgres performs with the `<=>` cosine-distance operator
 * (similarity = 1 − distance), so the gateway can re-check a candidate returned
 * by the HNSW search without a second round-trip.
 *
 * @throws EmbeddingDimensionError when the vectors differ in length.
 */
export function cosineSimilarity(a: Embedding, b: Embedding): number {
  if (a.length !== b.length) {
    throw new EmbeddingDimensionError(b.length, a.length);
  }
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    const ai = a[i] as number;
    const bi = b[i] as number;
    dot += ai * bi;
    normA += ai * ai;
    normB += bi * bi;
  }
  if (normA === 0 || normB === 0) {
    return 0;
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/** Whether `similarity` clears the acceptance threshold for a positive match. */
export function isMatch(similarity: number, threshold: number = DEFAULT_FACE_MATCH_THRESHOLD): boolean {
  return similarity >= threshold;
}

/** Convenience: the embedding model assumed when a record omits one. */
export const DEFAULT_MODEL = DEFAULT_EMBEDDING_MODEL;
