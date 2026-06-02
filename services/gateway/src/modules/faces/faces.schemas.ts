import { z } from 'zod';

/** Params for face sub-resource routes: `/students/:id/faces/:embeddingId`. */
export const faceParamsSchema = z.object({
  id: z.string().uuid(),
  embeddingId: z.string().uuid(),
});
export type FaceParams = z.infer<typeof faceParamsSchema>;
