import { Router } from 'express';
import { Capability } from '../../domain/index.js';
import { authenticate } from '../../http/middleware/authenticate.js';
import { requireCapability } from '../../http/middleware/authorize.js';
import { validate } from '../../http/middleware/validate.js';
import { imageUpload } from '../../http/middleware/upload.js';
import { idempotency } from '../../http/middleware/idempotency.js';
import { idParamSchema } from '../../http/common.schemas.js';
import {
  createStudentHandler,
  deleteStudentHandler,
  getStudentHandler,
  listStudentsHandler,
  updateStudentHandler,
} from './students.controller.js';
import {
  createStudentSchema,
  listStudentsQuerySchema,
  updateStudentSchema,
} from './students.schemas.js';
import {
  deleteFaceHandler,
  enrollFaceHandler,
  listFacesHandler,
} from '../faces/faces.controller.js';
import { faceParamsSchema } from '../faces/faces.schemas.js';

export const studentsRouter: Router = Router();

// Roster management is available to professors and admins (ENROLL_STUDENTS).
studentsRouter.use(authenticate, requireCapability(Capability.ENROLL_STUDENTS));

studentsRouter.get('/', validate({ query: listStudentsQuerySchema }), listStudentsHandler);
studentsRouter.post('/', validate({ body: createStudentSchema }), createStudentHandler);
studentsRouter.get('/:id', validate({ params: idParamSchema }), getStudentHandler);
studentsRouter.patch(
  '/:id',
  validate({ params: idParamSchema, body: updateStudentSchema }),
  updateStudentHandler,
);
studentsRouter.delete('/:id', validate({ params: idParamSchema }), deleteStudentHandler);

// Face enrollment sub-resource (512-d embeddings via the AI service).
studentsRouter.post(
  '/:id/faces',
  validate({ params: idParamSchema }),
  idempotency,
  imageUpload.single('image'),
  enrollFaceHandler,
);
studentsRouter.get('/:id/faces', validate({ params: idParamSchema }), listFacesHandler);
studentsRouter.delete(
  '/:id/faces/:embeddingId',
  validate({ params: faceParamsSchema }),
  deleteFaceHandler,
);
