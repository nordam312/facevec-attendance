import { createHash } from 'node:crypto';
import type { Buffer } from 'node:buffer';
import { EMBEDDING_DIMENSIONS } from '../../domain/index.js';
import { ConflictError, HttpError, NotFoundError } from '../../errors/index.js';
import { extractEmbeddings } from '../ai/ai.client.js';
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

export interface EnrollFaceResult {
  embedding: FaceEmbeddingDto;
  faceCount: number;
}

/** Extract a face embedding from an image and persist it for the student. */
export async function enrollFace(studentId: string, file: UploadedImage): Promise<EnrollFaceResult> {
  await getStudent(studentId); // 404 if the student does not exist

  const result = await extractEmbeddings(file.buffer, file.originalname, file.mimetype);
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

  // De-duplicate re-uploads of the identical image.
  const hash = createHash('sha256').update(file.buffer).digest('hex');
  if (await existsByHash(studentId, hash)) {
    throw new ConflictError('This image has already been enrolled for this student');
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
