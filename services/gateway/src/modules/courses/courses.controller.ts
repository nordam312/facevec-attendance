import { actorOf } from '../../http/context.js';
import { asyncHandler } from '../../http/async-handler.js';
import { paginatedResponse } from '../../http/pagination.js';
import type { IdParam, Pagination } from '../../http/common.schemas.js';
import {
  createCourse,
  deleteCourse,
  enrollStudent,
  getCourse,
  listCourses,
  listEnrollments,
  unenrollStudent,
  updateCourse,
} from './courses.service.js';
import { serializeCourse, serializeEnrollment } from './course.serializer.js';
import type {
  CreateCourseInput,
  EnrollmentParams,
  EnrollStudentInput,
  ListCoursesQuery,
  UpdateCourseInput,
} from './courses.schemas.js';

export const listCoursesHandler = asyncHandler(async (req, res) => {
  const page = await listCourses(req.valid?.query as ListCoursesQuery, actorOf(req));
  res.json(paginatedResponse(page, serializeCourse));
});

export const getCourseHandler = asyncHandler(async (req, res) => {
  const { id } = req.valid?.params as IdParam;
  res.json({ course: serializeCourse(await getCourse(id, actorOf(req))) });
});

export const createCourseHandler = asyncHandler(async (req, res) => {
  const course = await createCourse(req.valid?.body as CreateCourseInput, actorOf(req));
  res.status(201).json({ course: serializeCourse(course) });
});

export const updateCourseHandler = asyncHandler(async (req, res) => {
  const { id } = req.valid?.params as IdParam;
  const course = await updateCourse(id, req.valid?.body as UpdateCourseInput, actorOf(req));
  res.json({ course: serializeCourse(course) });
});

export const deleteCourseHandler = asyncHandler(async (req, res) => {
  const { id } = req.valid?.params as IdParam;
  await deleteCourse(id, actorOf(req));
  res.status(204).end();
});

export const listEnrollmentsHandler = asyncHandler(async (req, res) => {
  const { id } = req.valid?.params as IdParam;
  const page = await listEnrollments(id, req.valid?.query as Pagination, actorOf(req));
  res.json(paginatedResponse(page, serializeEnrollment));
});

export const enrollStudentHandler = asyncHandler(async (req, res) => {
  const { id } = req.valid?.params as IdParam;
  const { studentId } = req.valid?.body as EnrollStudentInput;
  const enrollment = await enrollStudent(id, studentId, actorOf(req));
  res.status(201).json({ enrollment: serializeEnrollment(enrollment) });
});

export const unenrollStudentHandler = asyncHandler(async (req, res) => {
  const { id, studentId } = req.valid?.params as EnrollmentParams;
  await unenrollStudent(id, studentId, actorOf(req));
  res.status(204).end();
});
