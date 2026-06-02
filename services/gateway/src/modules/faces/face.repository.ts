import { prisma } from '../../db/prisma.js';

/**
 * Raw-SQL access to `face_embeddings`. The `embedding` column is pgvector's
 * `vector(512)`, which the Prisma client cannot select/insert through its typed
 * API, so all vector reads/writes live here. Vectors are passed as pgvector's
 * text form `[a,b,c]` and cast with `::vector`.
 */

function toVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(',')}]`;
}

export interface InsertEmbeddingInput {
  studentId: string;
  embedding: number[];
  model: string;
  quality: number | null;
  sourceImageHash: string | null;
}

export async function insertEmbedding(input: InsertEmbeddingInput): Promise<{ id: string; createdAt: Date }> {
  const vector = toVectorLiteral(input.embedding);
  const rows = await prisma.$queryRaw<{ id: string; created_at: Date }[]>`
    INSERT INTO face_embeddings (student_id, embedding, model, quality, source_image_hash)
    VALUES (${input.studentId}::uuid, ${vector}::vector, ${input.model}, ${input.quality}, ${input.sourceImageHash})
    RETURNING id, created_at`;
  const row = rows[0];
  if (!row) {
    throw new Error('insertEmbedding returned no row');
  }
  return { id: row.id, createdAt: row.created_at };
}

export interface EmbeddingMeta {
  id: string;
  model: string;
  quality: number | null;
  sourceImageHash: string | null;
  createdAt: Date;
}

export async function listByStudent(studentId: string): Promise<EmbeddingMeta[]> {
  const rows = await prisma.$queryRaw<
    { id: string; model: string; quality: number | null; source_image_hash: string | null; created_at: Date }[]
  >`
    SELECT id, model, quality, source_image_hash, created_at
    FROM face_embeddings
    WHERE student_id = ${studentId}::uuid
    ORDER BY created_at DESC`;
  return rows.map((r) => ({
    id: r.id,
    model: r.model,
    quality: r.quality,
    sourceImageHash: r.source_image_hash,
    createdAt: r.created_at,
  }));
}

export async function existsByHash(studentId: string, hash: string): Promise<boolean> {
  const rows = await prisma.$queryRaw<{ exists: boolean }[]>`
    SELECT EXISTS(
      SELECT 1 FROM face_embeddings WHERE student_id = ${studentId}::uuid AND source_image_hash = ${hash}
    ) AS exists`;
  return rows[0]?.exists ?? false;
}

export async function deleteEmbedding(studentId: string, embeddingId: string): Promise<number> {
  const affected = await prisma.$executeRaw`
    DELETE FROM face_embeddings WHERE id = ${embeddingId}::uuid AND student_id = ${studentId}::uuid`;
  return affected;
}

export interface NearestMatch {
  studentId: string;
  fullName: string;
  studentNumber: string;
  similarity: number;
}

/**
 * Nearest enrolled face within a course's roster, by cosine similarity.
 * The roster join means the HNSW index is not used (post-filtering); for the
 * dataset sizes here a filtered scan is correct and fast enough. A global ANN
 * pre-filter would be the optimization if rosters grow large.
 */
export async function searchNearestInCourse(
  courseId: string,
  embedding: number[],
  limit = 1,
): Promise<NearestMatch[]> {
  const vector = toVectorLiteral(embedding);
  const rows = await prisma.$queryRaw<
    { student_id: string; full_name: string; student_number: string; similarity: number }[]
  >`
    SELECT s.id AS student_id, s.full_name, s.student_number,
           1 - (fe.embedding <=> ${vector}::vector) AS similarity
    FROM face_embeddings fe
    JOIN students s ON s.id = fe.student_id
    JOIN course_enrollments ce ON ce.student_id = s.id AND ce.course_id = ${courseId}::uuid
    ORDER BY fe.embedding <=> ${vector}::vector
    LIMIT ${limit}`;
  return rows.map((r) => ({
    studentId: r.student_id,
    fullName: r.full_name,
    studentNumber: r.student_number,
    similarity: Number(r.similarity),
  }));
}
