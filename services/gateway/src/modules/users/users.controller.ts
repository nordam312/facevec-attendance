import { asyncHandler } from '../../http/async-handler.js';
import { paginatedResponse } from '../../http/pagination.js';
import type { IdParam } from '../../http/common.schemas.js';
import {
  createUser,
  deleteUser,
  getUser,
  listUsers,
  updateUser,
} from './users.service.js';
import { serializeUser } from './user.serializer.js';
import type { CreateUserInput, ListUsersQuery, UpdateUserInput } from './users.schemas.js';

export const listUsersHandler = asyncHandler(async (req, res) => {
  const page = await listUsers(req.valid?.query as ListUsersQuery);
  res.json(paginatedResponse(page, serializeUser));
});

export const getUserHandler = asyncHandler(async (req, res) => {
  const { id } = req.valid?.params as IdParam;
  res.json({ user: serializeUser(await getUser(id)) });
});

export const createUserHandler = asyncHandler(async (req, res) => {
  const user = await createUser(req.valid?.body as CreateUserInput);
  res.status(201).json({ user: serializeUser(user) });
});

export const updateUserHandler = asyncHandler(async (req, res) => {
  const { id } = req.valid?.params as IdParam;
  const user = await updateUser(id, req.valid?.body as UpdateUserInput);
  res.json({ user: serializeUser(user) });
});

export const deleteUserHandler = asyncHandler(async (req, res) => {
  const { id } = req.valid?.params as IdParam;
  await deleteUser(id);
  res.status(204).end();
});
