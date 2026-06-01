import { asyncHandler } from '../../http/async-handler.js';
import { paginatedResponse } from '../../http/pagination.js';
import type { IdParam } from '../../http/common.schemas.js';
import {
  createStudent,
  deleteStudent,
  getStudent,
  listStudents,
  updateStudent,
} from './students.service.js';
import { serializeStudent } from './student.serializer.js';
import type {
  CreateStudentInput,
  ListStudentsQuery,
  UpdateStudentInput,
} from './students.schemas.js';

export const listStudentsHandler = asyncHandler(async (req, res) => {
  const page = await listStudents(req.valid?.query as ListStudentsQuery);
  res.json(paginatedResponse(page, serializeStudent));
});

export const getStudentHandler = asyncHandler(async (req, res) => {
  const { id } = req.valid?.params as IdParam;
  res.json({ student: serializeStudent(await getStudent(id)) });
});

export const createStudentHandler = asyncHandler(async (req, res) => {
  const student = await createStudent(req.valid?.body as CreateStudentInput);
  res.status(201).json({ student: serializeStudent(student) });
});

export const updateStudentHandler = asyncHandler(async (req, res) => {
  const { id } = req.valid?.params as IdParam;
  const student = await updateStudent(id, req.valid?.body as UpdateStudentInput);
  res.json({ student: serializeStudent(student) });
});

export const deleteStudentHandler = asyncHandler(async (req, res) => {
  const { id } = req.valid?.params as IdParam;
  await deleteStudent(id);
  res.status(204).end();
});
