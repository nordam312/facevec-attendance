import { Router } from 'express';
import { Capability } from '../../domain/index.js';
import { authenticate } from '../../http/middleware/authenticate.js';
import { requireCapability } from '../../http/middleware/authorize.js';
import { validate } from '../../http/middleware/validate.js';
import { idParamSchema } from '../../http/common.schemas.js';
import {
  createUserHandler,
  deleteUserHandler,
  getUserHandler,
  listUsersHandler,
  updateUserHandler,
} from './users.controller.js';
import { createUserSchema, listUsersQuerySchema, updateUserSchema } from './users.schemas.js';

export const usersRouter: Router = Router();

// Every user-management route is ADMIN-only (MANAGE_USERS capability).
usersRouter.use(authenticate, requireCapability(Capability.MANAGE_USERS));

usersRouter.get('/', validate({ query: listUsersQuerySchema }), listUsersHandler);
usersRouter.post('/', validate({ body: createUserSchema }), createUserHandler);
usersRouter.get('/:id', validate({ params: idParamSchema }), getUserHandler);
usersRouter.patch(
  '/:id',
  validate({ params: idParamSchema, body: updateUserSchema }),
  updateUserHandler,
);
usersRouter.delete('/:id', validate({ params: idParamSchema }), deleteUserHandler);
