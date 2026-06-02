import type {
  Course,
  Enrollment,
  FaceEmbedding,
  IdentifyResult,
  Paginated,
  Session,
  AttendanceRecord,
  Student,
  User,
} from './types';

const BASE = (process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:8080') + '/api/v1';

/** The access token lives in memory; the refresh token is an httpOnly cookie. */
let accessToken: string | null = null;
export function setAccessToken(token: string | null): void {
  accessToken = token;
}
export function getAccessToken(): string | null {
  return accessToken;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface RequestOptions {
  method?: string;
  json?: unknown;
  form?: FormData;
  retry?: boolean;
}

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { method = 'GET', json, form, retry = true } = opts;
  const headers: Record<string, string> = {};
  if (accessToken) headers.authorization = `Bearer ${accessToken}`;
  if (json !== undefined) headers['content-type'] = 'application/json';

  const res = await fetch(BASE + path, {
    method,
    headers,
    credentials: 'include',
    body: json !== undefined ? JSON.stringify(json) : form,
  });

  // Transparently refresh once on a 401 (except on the auth endpoints themselves).
  if (res.status === 401 && retry && !path.startsWith('/auth/')) {
    const refreshed = await api.refresh().catch(() => null);
    if (refreshed) {
      setAccessToken(refreshed.accessToken);
      return request<T>(path, { ...opts, retry: false });
    }
  }

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  const payload: unknown = text ? JSON.parse(text) : null;

  if (!res.ok) {
    const err = (payload as { error?: { code?: string; message?: string; details?: unknown } } | null)?.error;
    throw new ApiError(res.status, err?.code ?? 'error', err?.message ?? res.statusText, err?.details);
  }
  return payload as T;
}

export interface AuthResponse {
  accessToken: string;
  tokenType: string;
  expiresIn: number;
  user: User;
}

export const api = {
  // --- auth ---
  login(email: string, password: string): Promise<AuthResponse> {
    return request<AuthResponse>('/auth/login', { method: 'POST', json: { email, password } });
  },
  register(email: string, password: string, displayName: string): Promise<AuthResponse> {
    return request<AuthResponse>('/auth/register', { method: 'POST', json: { email, password, displayName } });
  },
  refresh(): Promise<AuthResponse> {
    return request<AuthResponse>('/auth/refresh', { method: 'POST', retry: false });
  },
  me(): Promise<{ user: User }> {
    return request<{ user: User }>('/auth/me');
  },
  logout(): Promise<void> {
    return request<void>('/auth/logout', { method: 'POST', retry: false });
  },

  // --- courses ---
  listCourses(page = 1): Promise<Paginated<Course>> {
    return request<Paginated<Course>>(`/courses?page=${page}&pageSize=50`);
  },
  createCourse(code: string, title: string): Promise<{ course: Course }> {
    return request<{ course: Course }>('/courses', { method: 'POST', json: { code, title } });
  },
  getCourse(id: string): Promise<{ course: Course }> {
    return request<{ course: Course }>(`/courses/${id}`);
  },
  listEnrollments(courseId: string): Promise<Paginated<Enrollment>> {
    return request<Paginated<Enrollment>>(`/courses/${courseId}/enrollments?pageSize=100`);
  },
  enroll(courseId: string, studentId: string): Promise<{ enrollment: Enrollment }> {
    return request<{ enrollment: Enrollment }>(`/courses/${courseId}/enrollments`, {
      method: 'POST',
      json: { studentId },
    });
  },
  unenroll(courseId: string, studentId: string): Promise<void> {
    return request<void>(`/courses/${courseId}/enrollments/${studentId}`, { method: 'DELETE' });
  },

  // --- students ---
  listStudents(search?: string): Promise<Paginated<Student>> {
    const q = search ? `&search=${encodeURIComponent(search)}` : '';
    return request<Paginated<Student>>(`/students?pageSize=50${q}`);
  },
  createStudent(studentNumber: string, fullName: string): Promise<{ student: Student }> {
    return request<{ student: Student }>('/students', { method: 'POST', json: { studentNumber, fullName } });
  },
  listFaces(studentId: string): Promise<{ data: FaceEmbedding[] }> {
    return request<{ data: FaceEmbedding[] }>(`/students/${studentId}/faces`);
  },
  enrollFace(studentId: string, image: Blob): Promise<{ status: string; jobId?: string; faceCount?: number }> {
    const form = new FormData();
    form.append('image', image, 'capture.jpg');
    return request(`/students/${studentId}/faces`, { method: 'POST', form });
  },

  // --- sessions / attendance ---
  openSession(courseId: string): Promise<{ session: Session }> {
    return request<{ session: Session }>(`/courses/${courseId}/sessions`, { method: 'POST' });
  },
  listSessions(courseId: string): Promise<Paginated<Session>> {
    return request<Paginated<Session>>(`/courses/${courseId}/sessions?pageSize=50`);
  },
  getSession(id: string): Promise<{ session: Session }> {
    return request<{ session: Session }>(`/sessions/${id}`);
  },
  closeSession(id: string): Promise<{ session: Session }> {
    return request<{ session: Session }>(`/sessions/${id}/close`, { method: 'POST' });
  },
  listRecords(sessionId: string): Promise<Paginated<AttendanceRecord>> {
    return request<Paginated<AttendanceRecord>>(`/sessions/${sessionId}/attendance?pageSize=100`);
  },
  identify(sessionId: string, image: Blob): Promise<IdentifyResult> {
    const form = new FormData();
    form.append('image', image, 'frame.jpg');
    return request<IdentifyResult>(`/sessions/${sessionId}/identify`, { method: 'POST', form });
  },
};
