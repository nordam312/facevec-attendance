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
import { createBulkImportJob, getImportJob } from './bulk-import.service.js';
import { serializeCourse, serializeEnrollment, serializeImportJob } from './course.serializer.js';
import type {
  BulkEnrollInput,
  CreateCourseInput,
  EnrollmentParams,
  EnrollStudentInput,
  ImportJobParams,
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
  const result = await enrollStudent(id, req.valid?.body as EnrollStudentInput, actorOf(req));
  // 200 if the link already existed (idempotent), 201 for a freshly created one.
  res.status(result.alreadyEnrolled ? 200 : 201).json({
    enrollment: serializeEnrollment(result.enrollment),
    created: result.created,
    alreadyEnrolled: result.alreadyEnrolled,
  });
});

export const bulkEnrollHandler = asyncHandler(async (req, res) => {
  const { id } = req.valid?.params as IdParam;
  const { rows } = req.valid?.body as BulkEnrollInput;
  const job = await createBulkImportJob(id, rows, actorOf(req));
  // Non-blocking: the job is queued; the client tracks progress over WebSocket.
  res.status(202).json({ job: serializeImportJob(job) });
});

export const getImportJobHandler = asyncHandler(async (req, res) => {
  const { id, jobId } = req.valid?.params as ImportJobParams;
  const job = await getImportJob(id, jobId, actorOf(req));
  res.json({ job: serializeImportJob(job) });
});

export const unenrollStudentHandler = asyncHandler(async (req, res) => {
  const { id, studentId } = req.valid?.params as EnrollmentParams;
  await unenrollStudent(id, studentId, actorOf(req));
  res.status(204).end();
});
