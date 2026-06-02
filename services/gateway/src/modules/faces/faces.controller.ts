import { asyncHandler } from '../../http/async-handler.js';
import { requireImage } from '../../http/middleware/upload.js';
import type { IdParam } from '../../http/common.schemas.js';
import { enrollFace, listFaces, removeFace } from './faces.service.js';
import type { FaceParams } from './faces.schemas.js';

export const enrollFaceHandler = asyncHandler(async (req, res) => {
  const { id } = req.valid?.params as IdParam;
  const file = requireImage(req);
  const result = await enrollFace(id, {
    buffer: file.buffer,
    mimetype: file.mimetype,
    originalname: file.originalname,
  });
  if (result.status === 'queued') {
    // AI unavailable — accepted for async processing via the fallback queue.
    res.status(202).json({ status: 'queued', jobId: result.jobId });
    return;
  }
  res.status(201).json({ status: 'enrolled', embedding: result.embedding, faceCount: result.faceCount });
});

export const listFacesHandler = asyncHandler(async (req, res) => {
  const { id } = req.valid?.params as IdParam;
  res.json({ data: await listFaces(id) });
});

export const deleteFaceHandler = asyncHandler(async (req, res) => {
  const { id, embeddingId } = req.valid?.params as FaceParams;
  await removeFace(id, embeddingId);
  res.status(204).end();
});
