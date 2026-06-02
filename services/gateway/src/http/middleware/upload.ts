import multer from 'multer';
import type { Request } from 'express';
import { config } from '../../config/env.js';
import { BadRequestError } from '../../errors/index.js';

/**
 * In-memory single-image upload. Files never touch disk — the buffer is handed
 * straight to the AI client. Size and type are enforced here at the edge.
 */
export const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.MAX_UPLOAD_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new BadRequestError('Only image uploads are accepted'));
    }
  },
});

/** Retrieve the uploaded image, asserting it is present. */
export function requireImage(req: Request): Express.Multer.File {
  if (!req.file) {
    throw new BadRequestError('Missing image upload (form field "image")');
  }
  return req.file;
}
