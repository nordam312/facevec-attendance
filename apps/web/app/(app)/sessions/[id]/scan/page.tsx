'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import type { IdentifyResult } from '@/lib/types';
import { CaptureInput } from '@/components/CaptureInput';
import { Alert, Badge, Card, Spinner } from '@/components/ui';

const message = (err: unknown) => (err instanceof ApiError ? err.message : 'Something went wrong');

export default function ScanPage() {
  const sessionId = useParams().id as string;
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<IdentifyResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const scan = async (image: Blob) => {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      setResult(await api.identify(sessionId, image));
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/sessions/${sessionId}`} className="text-sm text-indigo-500 hover:underline">
          ← Live feed
        </Link>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">Recognize attendance</h1>
        <p className="text-sm text-neutral-500">Capture a face — a match above threshold is recorded automatically.</p>
      </div>

      {error && <Alert>{error}</Alert>}

      <Card>
        <CaptureInput onCapture={scan} busy={busy} />
      </Card>

      {busy && <Spinner label="Identifying…" />}

      {result && (
        <Card>
          {result.matched && result.student ? (
            <div className="flex items-center justify-between gap-3">
              <div>
                <Badge tone="green">Match — recorded</Badge>
                <p className="mt-2 font-semibold">{result.student.fullName}</p>
                <p className="text-sm text-neutral-500">{result.student.studentNumber}</p>
              </div>
              {result.similarity !== null && (
                <div className="text-right">
                  <p className="text-2xl font-bold text-green-600">{(result.similarity * 100).toFixed(1)}%</p>
                  <p className="text-xs text-neutral-500">threshold {(result.threshold * 100).toFixed(0)}%</p>
                </div>
              )}
            </div>
          ) : (
            <div>
              <Badge tone="amber">No match</Badge>
              <p className="mt-2 text-sm text-neutral-500">
                No enrolled face cleared the {(result.threshold * 100).toFixed(0)}% threshold
                {result.similarity !== null && ` (best ${(result.similarity * 100).toFixed(1)}%)`}.
              </p>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
