import { actorOf } from '../../http/context.js';
import { asyncHandler } from '../../http/async-handler.js';
import { requireImage } from '../../http/middleware/upload.js';
import { paginatedResponse } from '../../http/pagination.js';
import type { IdParam, Pagination } from '../../http/common.schemas.js';
import {
  closeSession,
  getSession,
  identifyAndRecord,
  listRecords,
  listSessions,
  markAttendance,
  openSession,
} from './attendance.service.js';
import { serializeRecord, serializeSession } from './attendance.serializer.js';
import type { MarkAttendanceInput } from './attendance.schemas.js';

export const openSessionHandler = asyncHandler(async (req, res) => {
  const { id } = req.valid?.params as IdParam;
  const session = await openSession(id, actorOf(req));
  res.status(201).json({ session: serializeSession(session) });
});

export const listSessionsHandler = asyncHandler(async (req, res) => {
  const { id } = req.valid?.params as IdParam;
  const page = await listSessions(id, req.valid?.query as Pagination, actorOf(req));
  res.json(paginatedResponse(page, serializeSession));
});

export const getSessionHandler = asyncHandler(async (req, res) => {
  const { id } = req.valid?.params as IdParam;
  res.json({ session: serializeSession(await getSession(id, actorOf(req))) });
});

export const closeSessionHandler = asyncHandler(async (req, res) => {
  const { id } = req.valid?.params as IdParam;
  const session = await closeSession(id, actorOf(req));
  res.json({ session: serializeSession(session) });
});

export const markAttendanceHandler = asyncHandler(async (req, res) => {
  const { id } = req.valid?.params as IdParam;
  const record = await markAttendance(id, req.valid?.body as MarkAttendanceInput, actorOf(req));
  res.status(201).json({ record: serializeRecord(record) });
});

export const listRecordsHandler = asyncHandler(async (req, res) => {
  const { id } = req.valid?.params as IdParam;
  const page = await listRecords(id, req.valid?.query as Pagination, actorOf(req));
  res.json(paginatedResponse(page, serializeRecord));
});

export const identifyHandler = asyncHandler(async (req, res) => {
  const { id } = req.valid?.params as IdParam;
  const file = requireImage(req);
  const result = await identifyAndRecord(
    id,
    { buffer: file.buffer, mimetype: file.mimetype, originalname: file.originalname },
    actorOf(req),
  );
  res.status(result.matched ? 201 : 200).json({
    matched: result.matched,
    similarity: result.similarity,
    threshold: result.threshold,
    student: result.student,
    record: result.record ? serializeRecord(result.record) : null,
  });
});
