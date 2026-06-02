import { Router } from 'express';
import { Capability } from '../../domain/index.js';
import { authenticate } from '../../http/middleware/authenticate.js';
import { requireCapability } from '../../http/middleware/authorize.js';
import { validate } from '../../http/middleware/validate.js';
import { imageUpload } from '../../http/middleware/upload.js';
import { idempotency } from '../../http/middleware/idempotency.js';
import { idParamSchema, paginationSchema } from '../../http/common.schemas.js';
import {
  closeSessionHandler,
  getSessionHandler,
  identifyHandler,
  listRecordsHandler,
  listSessionsHandler,
  markAttendanceHandler,
  openSessionHandler,
} from './attendance.controller.js';
import { markAttendanceSchema } from './attendance.schemas.js';

/**
 * Attendance routes span two prefixes (`/courses/:id/sessions` to open/list,
 * `/sessions/:id/...` to operate on a session), so this router is mounted at
 * the API root rather than under a single resource path. The auth guard is
 * applied per-route (not via `router.use`) so that unmatched paths fall through
 * to the 404 handler instead of being rejected with a 401.
 */
export const attendanceRouter: Router = Router();

const guard = [authenticate, requireCapability(Capability.RUN_ATTENDANCE)];

// Course-scoped: open and list sessions.
attendanceRouter.post(
  '/courses/:id/sessions',
  ...guard,
  validate({ params: idParamSchema }),
  openSessionHandler,
);
attendanceRouter.get(
  '/courses/:id/sessions',
  ...guard,
  validate({ params: idParamSchema, query: paginationSchema }),
  listSessionsHandler,
);

// Session-scoped: inspect, close, and record attendance.
attendanceRouter.get(
  '/sessions/:id',
  ...guard,
  validate({ params: idParamSchema }),
  getSessionHandler,
);
attendanceRouter.post(
  '/sessions/:id/close',
  ...guard,
  validate({ params: idParamSchema }),
  closeSessionHandler,
);
attendanceRouter.post(
  '/sessions/:id/attendance',
  ...guard,
  validate({ params: idParamSchema, body: markAttendanceSchema }),
  idempotency,
  markAttendanceHandler,
);
// Face recognition: extract → match within roster → record on success.
attendanceRouter.post(
  '/sessions/:id/identify',
  ...guard,
  validate({ params: idParamSchema }),
  idempotency,
  imageUpload.single('image'),
  identifyHandler,
);
attendanceRouter.get(
  '/sessions/:id/attendance',
  ...guard,
  validate({ params: idParamSchema, query: paginationSchema }),
  listRecordsHandler,
);
