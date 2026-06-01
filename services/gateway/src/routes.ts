import { Router } from 'express';
import { authRouter } from './modules/auth/auth.routes.js';
import { usersRouter } from './modules/users/users.routes.js';
import { studentsRouter } from './modules/students/students.routes.js';
import { coursesRouter } from './modules/courses/courses.routes.js';
import { attendanceRouter } from './modules/attendance/attendance.routes.js';

/** Versioned API surface, mounted at `/api/v1`. */
export const apiRouter: Router = Router();

apiRouter.use('/auth', authRouter);
apiRouter.use('/users', usersRouter);
apiRouter.use('/students', studentsRouter);
apiRouter.use('/courses', coursesRouter);
// Attendance spans /courses/:id/sessions and /sessions/:id, so it is mounted at
// the root and falls through after the courses router.
apiRouter.use('/', attendanceRouter);
