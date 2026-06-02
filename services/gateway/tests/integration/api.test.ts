import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { prisma } from '../../src/db/prisma.js';
import { hashPassword } from '../../src/modules/auth/password.service.js';

const app = createApp();
const ADMIN = { email: 'admin@test.local', password: 'AdminPass123!' };

async function truncate(): Promise<void> {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE users, students, courses, course_enrollments, attendance_sessions, attendance_records, refresh_tokens, outbox_messages, face_embeddings RESTART IDENTITY CASCADE',
  );
}

async function login(email: string, password: string): Promise<string> {
  const res = await request(app).post('/api/v1/auth/login').send({ email, password });
  expect(res.status).toBe(200);
  return res.body.accessToken as string;
}

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

beforeAll(async () => {
  await truncate();
  await prisma.user.create({
    data: {
      email: ADMIN.email,
      passwordHash: await hashPassword(ADMIN.password),
      displayName: 'Admin',
      role: 'ADMIN',
    },
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('health', () => {
  it('GET /health is ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
  it('unknown route is 404', async () => {
    const res = await request(app).get('/api/v1/nope');
    expect(res.status).toBe(404);
  });
});

describe('auth', () => {
  it('registers a STUDENT and returns tokens', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'stud@test.local', password: 'password123', displayName: 'Stud' });
    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe('STUDENT');
    expect(res.body.accessToken).toBeTruthy();
  });

  it('rejects invalid registration with 422', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'bad', password: 'x', displayName: '' });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('validation_error');
  });

  it('logs in and resolves /me; rejects no/garbage token', async () => {
    const token = await login(ADMIN.email, ADMIN.password);
    const me = await request(app).get('/api/v1/auth/me').set(bearer(token));
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe(ADMIN.email);

    expect((await request(app).get('/api/v1/auth/me')).status).toBe(401);
    expect((await request(app).get('/api/v1/auth/me').set(bearer('garbage'))).status).toBe(401);
  });

  it('rejects wrong credentials', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({ email: ADMIN.email, password: 'wrong' });
    expect(res.status).toBe(401);
  });

  it('rotates refresh tokens and detects reuse', async () => {
    const loginRes = await request(app).post('/api/v1/auth/login').send(ADMIN);
    const cookie = loginRes.headers['set-cookie'];
    expect(cookie).toBeTruthy();

    const rotate = await request(app).post('/api/v1/auth/refresh').set('Cookie', cookie);
    expect(rotate.status).toBe(200);

    // Replaying the now-rotated cookie is detected reuse → 401.
    const reuse = await request(app).post('/api/v1/auth/refresh').set('Cookie', cookie);
    expect(reuse.status).toBe(401);
  });
});

describe('RBAC & resources', () => {
  let adminToken: string;
  let profToken: string;
  let prof2Token: string;
  let studentToken: string;

  beforeAll(async () => {
    adminToken = await login(ADMIN.email, ADMIN.password);
    // Admin provisions two professors.
    for (const email of ['prof@test.local', 'prof2@test.local']) {
      await request(app)
        .post('/api/v1/users')
        .set(bearer(adminToken))
        .send({ email, password: 'password123', displayName: email, role: 'PROFESSOR' });
    }
    profToken = await login('prof@test.local', 'password123');
    prof2Token = await login('prof2@test.local', 'password123');
    const reg = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'rbac-stud@test.local', password: 'password123', displayName: 'S' });
    studentToken = reg.body.accessToken;
  });

  it('enforces RBAC on user management', async () => {
    expect((await request(app).get('/api/v1/users').set(bearer(adminToken))).status).toBe(200);
    expect((await request(app).get('/api/v1/users').set(bearer(studentToken))).status).toBe(403);
    expect((await request(app).get('/api/v1/users').set(bearer(profToken))).status).toBe(403);
  });

  it('forbids students from creating courses', async () => {
    const res = await request(app)
      .post('/api/v1/courses')
      .set(bearer(studentToken))
      .send({ code: 'X', title: 'Y' });
    expect(res.status).toBe(403);
  });

  it('lets a professor CRUD their own course and isolates others', async () => {
    const create = await request(app)
      .post('/api/v1/courses')
      .set(bearer(profToken))
      .send({ code: 'CS-401', title: 'Distributed Systems' });
    expect(create.status).toBe(201);
    const courseId = create.body.course.id as string;

    expect((await request(app).get(`/api/v1/courses/${courseId}`).set(bearer(profToken))).status).toBe(200);
    // A different professor cannot see it.
    expect((await request(app).get(`/api/v1/courses/${courseId}`).set(bearer(prof2Token))).status).toBe(403);
    // Admin can.
    expect((await request(app).get(`/api/v1/courses/${courseId}`).set(bearer(adminToken))).status).toBe(200);

    // Duplicate code → 409.
    const dup = await request(app)
      .post('/api/v1/courses')
      .set(bearer(profToken))
      .send({ code: 'CS-401', title: 'Dup' });
    expect(dup.status).toBe(409);
  });

  it('runs the roster + manual attendance flow', async () => {
    const course = await request(app)
      .post('/api/v1/courses')
      .set(bearer(profToken))
      .send({ code: 'CS-500', title: 'Seminar' });
    const courseId = course.body.course.id as string;

    const student = await request(app)
      .post('/api/v1/students')
      .set(bearer(profToken))
      .send({ studentNumber: 'S-900', fullName: 'Ada' });
    expect(student.status).toBe(201);
    const studentId = student.body.student.id as string;

    // duplicate student number → 409
    const dupStudent = await request(app)
      .post('/api/v1/students')
      .set(bearer(profToken))
      .send({ studentNumber: 'S-900', fullName: 'Dup' });
    expect(dupStudent.status).toBe(409);

    expect(
      (await request(app).post(`/api/v1/courses/${courseId}/enrollments`).set(bearer(profToken)).send({ studentId }))
        .status,
    ).toBe(201);

    const session = await request(app).post(`/api/v1/courses/${courseId}/sessions`).set(bearer(profToken));
    expect(session.status).toBe(201);
    const sessionId = session.body.session.id as string;

    const mark = await request(app)
      .post(`/api/v1/sessions/${sessionId}/attendance`)
      .set(bearer(profToken))
      .send({ studentId });
    expect(mark.status).toBe(201);
    expect(mark.body.record.method).toBe('MANUAL');

    // An outbox row was written transactionally with the attendance record.
    const outbox = await prisma.outboxMessage.count({ where: { eventType: 'attendance.recorded' } });
    expect(outbox).toBeGreaterThan(0);

    const records = await request(app).get(`/api/v1/sessions/${sessionId}/attendance`).set(bearer(profToken));
    expect(records.body.meta.total).toBe(1);
  });
});
