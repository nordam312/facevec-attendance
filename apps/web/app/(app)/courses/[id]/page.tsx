'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import type { Course, Enrollment, Session } from '@/lib/types';
import { Alert, Badge, Button, Card, Spinner } from '@/components/ui';
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
        <Link href="/courses" className="text-sm text-indigo-500 hover:underline">
          ← Courses
        </Link>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">{course.title}</h1>
        <p className="text-sm uppercase tracking-wide text-neutral-500">{course.code}</p>
      </div>

      {error && <Alert>{error}</Alert>}
      {feedback && <Alert tone="green">{feedback}</Alert>}

      <RosterAddForm courseId={courseId} onChanged={load} />
      <BulkImportPanel courseId={courseId} onChanged={load} />

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Roster {roster && <span className="text-neutral-400">({roster.length})</span>}</h2>
        {roster === null ? (
          <Spinner />
        ) : roster.length === 0 ? (
          <p className="text-sm text-neutral-500">No students enrolled.</p>
        ) : (
          roster.map((e) => (
            <Card key={e.id}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-medium">{e.student.fullName}</p>
                  <p className="text-xs text-neutral-500">{e.student.studentNumber}</p>
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
                <div className="mt-4 border-t border-neutral-200 pt-4 dark:border-neutral-800">
                  <CaptureInput onCapture={(img) => void enrollFace(e.student.id, img)} />
                </div>
              )}
            </Card>
          ))
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Attendance sessions</h2>
          <Button onClick={() => void openSession()}>Open session</Button>
        </div>
        {sessions === null ? (
          <Spinner />
        ) : sessions.length === 0 ? (
          <p className="text-sm text-neutral-500">No sessions yet.</p>
        ) : (
          sessions.map((s) => (
            <Card key={s.id}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-mono text-xs text-neutral-500">{s.id.slice(0, 8)}</p>
                  <p className="text-xs text-neutral-400">{new Date(s.startedAt).toLocaleString()}</p>
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
              </div>
            </Card>
          ))
        )}
      </section>
    </div>
  );
}
