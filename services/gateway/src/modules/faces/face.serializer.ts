import type { EmbeddingMeta } from './face.repository.js';

export interface FaceEmbeddingDto {
  id: string;
  studentId: string;
  model: string;
  quality: number | null;
  sourceImageHash: string | null;
  createdAt: string;
}

export function serializeEmbedding(studentId: string, meta: EmbeddingMeta): FaceEmbeddingDto {
  return {
    id: meta.id,
    studentId,
    model: meta.model,
    quality: meta.quality,
    sourceImageHash: meta.sourceImageHash,
    createdAt: meta.createdAt.toISOString(),
  };
}
