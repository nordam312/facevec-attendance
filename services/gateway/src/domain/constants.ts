/**
 * Domain-wide constants shared across the gateway and (by mirroring) the AI
 * inference service. Keep these framework-agnostic — no env access, no I/O.
 */

/** Dimensionality of an InsightFace embedding vector (`buffalo_l` → 512). */
export const EMBEDDING_DIMENSIONS = 512;

/** Default InsightFace model pack used for enrollment / identification. */
export const DEFAULT_EMBEDDING_MODEL = 'buffalo_l';

/**
 * Cosine-similarity acceptance threshold for identification, in [0, 1].
 * A candidate is accepted only when its similarity to a stored embedding is at
 * least this value. Operators can override it per-deployment via the
 * `FACE_MATCH_THRESHOLD` environment variable (wired in Phase 2).
 */
export const DEFAULT_FACE_MATCH_THRESHOLD = 0.75;
