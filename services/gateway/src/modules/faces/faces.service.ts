import { createHash, randomUUID } from 'node:crypto';
import type { Buffer } from 'node:buffer';
import { EMBEDDING_DIMENSIONS } from '../../domain/index.js';
import { ConflictError, HttpError, NotFoundError } from '../../errors/index.js';
import { extractViaBreaker, isAiFailure } from '../ai/ai.breaker.js';
import { enqueueEnrollmentTask } from '../../messaging/face-tasks.js';
import { logger } from '../../observability/logger.js';
import { getStudent } from '../students/students.service.js';
import {
  deleteEmbedding,
  existsByHash,
  insertEmbedding,
  listByStudent,
} from './face.repository.js';
import { serializeEmbedding, type FaceEmbeddingDto } from './face.serializer.js';

export interface UploadedImage {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
}

export type EnrollFaceResult =
  | { status: 'enrolled'; embedding: FaceEmbeddingDto; faceCount: number }
  | { status: 'queued'; jobId: string };

/**
 * Extract a face embedding and persist it. The AI call goes through the circuit
 * breaker; if the AI service is unavailable (or the breaker is open), the
 * enrollment is queued for async processing and `{ status: 'queued' }` is
 * returned (HTTP 202) rather than failing the request.
 */
export async function enrollFace(studentId: string, file: UploadedImage): Promise<EnrollFaceResult> {
  await getStudent(studentId); // 404 if the student does not exist

  // De-duplicate re-uploads of the identical image up front.
  const hash = createHash('sha256').update(file.buffer).digest('hex');
  if (await existsByHash(studentId, hash)) {
    throw new ConflictError('This image has already been enrolled for this student');
  }

  let result;
  try {
    result = await extractViaBreaker(file.buffer, file.originalname, file.mimetype);
  } catch (err) {
    if (!isAiFailure(err)) throw err;
    // AI down / breaker open → fall back to the async queue.
    const jobId = randomUUID();
    try {
      await enqueueEnrollmentTask({
        type: 'face.enrollment.requested',
        jobId,
        studentId,
        image: file.buffer.toString('base64'),
        mimetype: file.mimetype,
        filename: file.originalname,
      });
    } catch {
      throw new HttpError(503, 'ai_unavailable', 'Face inference is unavailable and the request could not be queued');
    }
    logger.info({ jobId, studentId }, 'enrollment queued for async processing (AI unavailable)');
    return { status: 'queued', jobId };
  }

  if (!result.primary) {
    throw new HttpError(422, 'no_face_detected', 'No face detected in the image');
  }
  const embedding = result.primary.embedding;
  if (embedding.length !== EMBEDDING_DIMENSIONS) {
    throw new HttpError(
      422,
      'bad_embedding',
      `Expected a ${EMBEDDING_DIMENSIONS}-d embedding, received ${embedding.length}`,
    );
  }

  const quality = result.primary.det_score;
  const inserted = await insertEmbedding({
    studentId,
    embedding,
    model: result.model,
    quality,
    sourceImageHash: hash,
  });

  return {
    status: 'enrolled',
    embedding: {
      id: inserted.id,
      studentId,
      model: result.model,
      quality,
      sourceImageHash: hash,
      createdAt: inserted.createdAt.toISOString(),
    },
    faceCount: result.faceCount,
  };
}

export async function listFaces(studentId: string): Promise<FaceEmbeddingDto[]> {
  await getStudent(studentId);
  const rows = await listByStudent(studentId);
  return rows.map((meta) => serializeEmbedding(studentId, meta));
}

export async function removeFace(studentId: string, embeddingId: string): Promise<void> {
  await getStudent(studentId);
  const affected = await deleteEmbedding(studentId, embeddingId);
  if (affected === 0) {
    throw new NotFoundError('Face embedding not found');
  }
}
