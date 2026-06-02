'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import type { Course } from '@/lib/types';
import { Alert, Button, Card, Input, Spinner } from '@/components/ui';

const message = (err: unknown) => (err instanceof ApiError ? err.message : 'Something went wrong');

export default function CoursesPage() {
  const [courses, setCourses] = useState<Course[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api
      .listCourses()
      .then((r) => setCourses(r.data))
      .catch((err) => setError(message(err)));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const create = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.createCourse(code, title);
      setCode('');
      setTitle('');
      load();
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Courses</h1>
        <p className="text-sm text-neutral-500">Create a course, manage its roster, and run attendance sessions.</p>
      </div>

      {error && <Alert>{error}</Alert>}

      <Card>
        <h2 className="mb-3 text-sm font-semibold">New course</h2>
        <form onSubmit={create} className="flex flex-col gap-3 sm:flex-row">
          <Input placeholder="Code (e.g. CS-401)" value={code} onChange={(e) => setCode(e.target.value)} required />
          <Input placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} required />
          <Button type="submit" disabled={busy}>
            {busy ? 'Creating…' : 'Create'}
          </Button>
        </form>
      </Card>

      {courses === null ? (
        <Spinner label="Loading courses…" />
      ) : courses.length === 0 ? (
        <p className="text-sm text-neutral-500">No courses yet.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {courses.map((course) => (
            <Link key={course.id} href={`/courses/${course.id}`}>
              <Card className="transition-colors hover:border-indigo-400">
                <p className="text-xs font-medium uppercase tracking-wide text-indigo-500">{course.code}</p>
                <p className="mt-1 font-semibold">{course.title}</p>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
