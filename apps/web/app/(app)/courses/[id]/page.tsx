'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import type { Course, Enrollment, Session } from '@/lib/types';
import { Alert, Badge, Button, Panel, Spinner } from '@/components/ui';
import { CaptureInput } from '@/components/CaptureInput';
import { RosterAddForm } from '@/components/RosterAddForm';
import { BulkImportPanel } from '@/components/BulkImportPanel';

const message = (err: unknown) => (err instanceof ApiError ? err.message : 'Something went wrong');

export default function CourseDetailPage() {
  const courseId = useParams().id as string;

  const [course, setCourse] = useState<Course | null>(null);
  const [roster, setRoster] = useState<Enrollment[] | null>(null);
  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [enrollFor, setEnrollFor] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const load = useCallback(() => {
    Promise.all([api.getCourse(courseId), api.listEnrollments(courseId), api.listSessions(courseId)])
      .then(([c, e, s]) => {
        setCourse(c.course);
        setRoster(e.data);
        setSessions(s.data);
      })
      .catch((err) => setError(message(err)));
  }, [courseId]);

  useEffect(() => {
    load();
  }, [load]);

  const remove = async (studentId: string) => {
    setError(null);
    try {
      await api.unenroll(courseId, studentId);
      load();
    } catch (err) {
      setError(message(err));
    }
  };

  const enrollFace = async (studentId: string, image: Blob) => {
    setFeedback(null);
    setError(null);
    try {
      const res = await api.enrollFace(studentId, image);
      setFeedback(
        res.status === 'queued'
          ? `Face queued for processing (AI busy) — job ${res.jobId?.slice(0, 8)}`
          : 'Face enrolled successfully.',
      );
    } catch (err) {
      setError(message(err));
    }
  };

  const openSession = async () => {
    setError(null);
    try {
      await api.openSession(courseId);
      load();
    } catch (err) {
      setError(message(err));
    }
  };

  if (!course) return <Spinner label="Loading course…" />;

  return (
    <div className="space-y-8">
      <div>
        <Link href="/courses" className="text-sm text-link hover:underline">
          ← Courses
        </Link>
        <h1 className="mt-1 text-xl font-bold tracking-tight text-brand-900">{course.title}</h1>
        <p className="text-sm font-semibold uppercase tracking-wide text-brand-700">{course.code}</p>
      </div>

      {error && <Alert>{error}</Alert>}
      {feedback && <Alert tone="green">{feedback}</Alert>}

      <RosterAddForm courseId={courseId} onChanged={load} />
      <BulkImportPanel courseId={courseId} onChanged={load} />

      <Panel title={`Roster${roster ? ` (${roster.length})` : ''}`}>
        {roster === null ? (
          <Spinner />
        ) : roster.length === 0 ? (
          <p className="text-sm text-ink-600">No students enrolled.</p>
        ) : (
          <ul className="divide-y divide-line">
            {roster.map((e) => (
              <li key={e.id} className="py-3 first:pt-0 last:pb-0">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-medium text-ink-900">{e.student.fullName}</p>
                    <p className="text-xs text-ink-400">{e.student.studentNumber}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="secondary"
                      onClick={() => setEnrollFor(enrollFor === e.student.id ? null : e.student.id)}
                    >
                      {enrollFor === e.student.id ? 'Close' : 'Enroll face'}
                    </Button>
                    <Button variant="ghost" onClick={() => void remove(e.student.id)}>
                      Remove
                    </Button>
                  </div>
                </div>
                {enrollFor === e.student.id && (
                  <div className="mt-4 border-t border-line pt-4">
                    <CaptureInput onCapture={(img) => void enrollFace(e.student.id, img)} />
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel
        title="Attendance sessions"
        action={
          <Button onClick={() => void openSession()} className="py-1.5">
            Open session
          </Button>
        }
      >
        {sessions === null ? (
          <Spinner />
        ) : sessions.length === 0 ? (
          <p className="text-sm text-ink-600">No sessions yet.</p>
        ) : (
          <ul className="divide-y divide-line">
            {sessions.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                <div>
                  <p className="font-mono text-xs text-brand-700">{s.id.slice(0, 8)}</p>
                  <p className="text-xs text-ink-400">{new Date(s.startedAt).toLocaleString()}</p>
                </div>
                <div className="flex items-center gap-3">
                  <Badge tone={s.status === 'OPEN' ? 'green' : 'gray'}>{s.status}</Badge>
                  <Link href={`/sessions/${s.id}`}>
                    <Button variant="secondary">Live feed</Button>
                  </Link>
                  <Link href={`/sessions/${s.id}/scan`}>
                    <Button variant="secondary">Scan</Button>
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
