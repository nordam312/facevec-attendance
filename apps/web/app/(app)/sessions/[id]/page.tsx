'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import type { AttendanceRecord, Session } from '@/lib/types';
import { useAttendanceFeed } from '@/lib/ws';
import { Alert, Badge, Button, Card, Spinner } from '@/components/ui';

const message = (err: unknown) => (err instanceof ApiError ? err.message : 'Something went wrong');

export default function SessionPage() {
  const sessionId = useParams().id as string;
  const [session, setSession] = useState<Session | null>(null);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const { status, events } = useAttendanceFeed(sessionId);

  const load = useCallback(() => {
    Promise.all([api.getSession(sessionId), api.listRecords(sessionId)])
      .then(([s, r]) => {
        setSession(s.session);
        setRecords(r.data);
      })
      .catch((err) => setError(message(err)));
  }, [sessionId]);

  useEffect(() => {
    load();
  }, [load]);

  // A live event carries only ids; reload to pick up the full student record.
  useEffect(() => {
    if (events.length > 0) load();
  }, [events.length, load]);

  const close = async () => {
    try {
      await api.closeSession(sessionId);
      load();
    } catch (err) {
      setError(message(err));
    }
  };

  if (!session) return <Spinner label="Loading session…" />;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Link href={`/courses/${session.courseId}`} className="text-sm text-indigo-500 hover:underline">
            ← Course
          </Link>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">Live attendance</h1>
          <div className="mt-1 flex items-center gap-2 text-sm text-neutral-500">
            <Badge tone={session.status === 'OPEN' ? 'green' : 'gray'}>{session.status}</Badge>
            <span className="flex items-center gap-1.5">
              <span
                className={`h-2 w-2 rounded-full ${status === 'open' ? 'bg-green-500' : status === 'connecting' ? 'bg-amber-500' : 'bg-red-500'}`}
              />
              feed {status}
            </span>
          </div>
        </div>
        <div className="flex gap-2">
          <Link href={`/sessions/${sessionId}/scan`}>
            <Button variant="secondary">Scan</Button>
          </Link>
          {session.status === 'OPEN' && (
            <Button variant="danger" onClick={() => void close()}>
              Close session
            </Button>
          )}
        </div>
      </div>

      {error && <Alert>{error}</Alert>}

      <Card>
        <h2 className="mb-3 text-sm font-semibold">
          Present <span className="text-neutral-400">({records.length})</span>
        </h2>
        {records.length === 0 ? (
          <p className="text-sm text-neutral-500">No one recorded yet. Recognitions appear here in real time.</p>
        ) : (
          <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
            {records.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 py-2.5">
                <div>
                  <p className="text-sm font-medium">{r.student.fullName}</p>
                  <p className="text-xs text-neutral-500">{r.student.studentNumber}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={r.method === 'FACE' ? 'indigo' : 'gray'}>{r.method}</Badge>
                  {r.similarity !== null && (
                    <span className="text-xs text-neutral-500">{(r.similarity * 100).toFixed(1)}%</span>
                  )}
                  <span className="text-xs text-neutral-400">{new Date(r.capturedAt).toLocaleTimeString()}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
