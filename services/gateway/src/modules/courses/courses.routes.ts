import { Router } from 'express';
import { Capability } from '../../domain/index.js';
import { authenticate } from '../../http/middleware/authenticate.js';
import { requireCapability } from '../../http/middleware/authorize.js';
import { validate } from '../../http/middleware/validate.js';
import { idParamSchema, paginationSchema } from '../../http/common.schemas.js';
import {
  createCourseHandler,
  deleteCourseHandler,
  enrollStudentHandler,
  getCourseHandler,
  listCoursesHandler,
  listEnrollmentsHandler,
  unenrollStudentHandler,
  updateCourseHandler,
} from './courses.controller.js';
import {
  createCourseSchema,
  enrollStudentSchema,
  enrollmentParamsSchema,
  listCoursesQuerySchema,
  updateCourseSchema,
} from './courses.schemas.js';

export const coursesRouter: Router = Router();

// Professors manage their own courses; admins manage all (MANAGE_OWN_COURSES;
// admins also hold MANAGE_COURSES, but the capability gate just needs the
// lesser one — ownership is enforced per-row in the service layer).
coursesRouter.use(authenticate, requireCapability(Capability.MANAGE_OWN_COURSES));

coursesRouter.get('/', validate({ query: listCoursesQuerySchema }), listCoursesHandler);
coursesRouter.post('/', validate({ body: createCourseSchema }), createCourseHandler);
coursesRouter.get('/:id', validate({ params: idParamSchema }), getCourseHandler);
coursesRouter.patch(
  '/:id',
  validate({ params: idParamSchema, body: updateCourseSchema }),
  updateCourseHandler,
);
coursesRouter.delete('/:id', validate({ params: idParamSchema }), deleteCourseHandler);

// Enrollment (roster) sub-resource.
coursesRouter.get(
  '/:id/enrollments',
  validate({ params: idParamSchema, query: paginationSchema }),
  listEnrollmentsHandler,
);
coursesRouter.post(
  '/:id/enrollments',
  validate({ params: idParamSchema, body: enrollStudentSchema }),
  enrollStudentHandler,
);
coursesRouter.delete(
  '/:id/enrollments/:studentId',
  validate({ params: enrollmentParamsSchema }),
  unenrollStudentHandler,
);
