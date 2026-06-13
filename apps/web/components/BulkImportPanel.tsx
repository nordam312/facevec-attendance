'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { api, ApiError } from '@/lib/api';
import type { BulkImportRow, ImportJob, ImportRowResult } from '@/lib/types';
import { useImportProgress } from '@/lib/ws';
import { Alert, Badge, Button, Panel } from '@/components/ui';

const message = (err: unknown) => (err instanceof ApiError ? err.message : 'Something went wrong');

// ---- Spreadsheet parsing (SheetJS: .xlsx / .xls / .csv) ----------------------

/** Trim a cell of any type (Excel may hand back numbers for student numbers). */
const cell = (v: unknown): string => (v == null ? '' : String(v).trim());

/**
 * Parse the first sheet of a workbook into roster rows. The first row is the
 * header (per the documented schema) and is dropped; columns are positional —
 * A = student number (required), B = full name, C = email (both optional).
 * Whitespace is trimmed and rows without a student number are skipped.
 */
async function parseWorkbook(file: File): Promise<BulkImportRow[]> {
  const data = new Uint8Array(await file.arrayBuffer());
  const wb = XLSX.read(data, { type: 'array' });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) return [];
  const sheet = wb.Sheets[sheetName];
  if (!sheet) return [];

  // header:1 → array-of-arrays; blankrows:false drops completely empty rows.
  const matrix = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    blankrows: false,
    defval: '',
  }) as unknown[][];

  const out: BulkImportRow[] = [];
  for (const r of matrix.slice(1)) {
    const studentNumber = cell(r[0]);
    if (!studentNumber) continue; // skip rows without a student number
    const fullName = cell(r[1]);
    const email = cell(r[2]);
    out.push({ studentNumber, ...(fullName ? { fullName } : {}), ...(email ? { email } : {}) });
  }
  return out;
}

/** Normalize a job's stored report into a row list (handles array or {rows}). */
function reportRows(report: ImportJob['report']): ImportRowResult[] {
  if (Array.isArray(report)) return report;
  if (report && 'rows' in report && Array.isArray(report.rows)) return report.rows;
  return [];
}

const ROW_TONE: Record<ImportRowResult['status'], 'green' | 'indigo' | 'gray' | 'red'> = {
  created: 'green',
  enrolled: 'indigo',
  already: 'gray',
  error: 'red',
};

export function BulkImportPanel({ courseId, onChanged }: { courseId: string; onChanged: () => void }) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<BulkImportRow[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [polledJob, setPolledJob] = useState<ImportJob | null>(null);
  const reloadedRef = useRef(false);

  const { status: feedStatus, progress } = useImportProgress(jobId);

  const onFile = async (file: File) => {
    setError(null);
    setFileName(file.name);
    try {
      const parsed = await parseWorkbook(file);
      if (parsed.length === 0) {
        setError('No rows with a student number were found. Is the first row a header?');
        setRows([]);
        return;
      }
      setRows(parsed);
    } catch {
      setError('Could not read this file. Please upload a valid .xlsx, .xls, or .csv file.');
      setRows([]);
    }
  };

  const startImport = async () => {
    setBusy(true);
    setError(null);
    setPolledJob(null);
    reloadedRef.current = false;
    try {
      const { job } = await api.bulkEnroll(courseId, rows);
      setJobId(job.id);
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setJobId(null);
    setPolledJob(null);
    setRows([]);
    setFileName(null);
    if (fileInput.current) fileInput.current.value = '';
  };

  // Derived live view: prefer the WebSocket frame, fall back to the polled job.
  const total = progress?.totalRows ?? polledJob?.totalRows ?? rows.length;
  const processed = progress?.processedRows ?? polledJob?.processedRows ?? 0;
  const jobStatus = progress?.status ?? polledJob?.status ?? (jobId ? 'PENDING' : null);
  const terminal = jobStatus === 'COMPLETED' || jobStatus === 'FAILED';
  const pct = total > 0 ? Math.round((processed / total) * 100) : 0;
  const counts = progress?.counts;
  const report = useMemo(
    () => progress?.report ?? reportRows(polledJob?.report ?? null),
    [progress?.report, polledJob?.report],
  );

  // Fallback poll: reconciles state if a WebSocket frame is missed (or never
  // connects), so the bar always reaches a terminal state.
  useEffect(() => {
    if (!jobId || terminal) return;
    const t = setInterval(() => {
      api
        .getImportJob(courseId, jobId)
        .then(({ job }) => setPolledJob(job))
        .catch(() => {
          /* best-effort */
        });
    }, 2500);
    return () => clearInterval(t);
  }, [jobId, terminal, courseId]);

  // Refresh the roster once when the import finishes.
  useEffect(() => {
    if (jobStatus === 'COMPLETED' && !reloadedRef.current) {
      reloadedRef.current = true;
      onChanged();
    }
  }, [jobStatus, onChanged]);

  const feedIndicator = jobId ? (
    <span className="flex items-center gap-1.5 text-xs font-normal text-ink-600">
      <span
        className={`h-2 w-2 rounded-full ${feedStatus === 'open' ? 'bg-green-500' : feedStatus === 'connecting' ? 'bg-amber-500' : 'bg-red-500'}`}
      />
      feed {feedStatus}
    </span>
  ) : undefined;

  return (
    <Panel title="Bulk import (Excel / CSV)" action={feedIndicator}>
      {error && (
        <div className="mb-3">
          <Alert>{error}</Alert>
        </div>
      )}

      {/* Idle: pick + preview a file. */}
      {!jobId && (
        <div className="space-y-3">
          <div className="rounded border border-line bg-section/60 p-3.5 text-xs text-ink-600">
            <p className="mb-2">
              <span className="font-semibold text-brand-900">Supported formats:</span> .xlsx, .xls,
              .csv
            </p>
            <p className="mb-1 font-semibold text-brand-900">Table structure (first sheet):</p>
            <ul className="list-disc space-y-0.5 pl-4 marker:text-brand-700">
              <li>The first row must be the header.</li>
              <li>
                <span className="font-medium text-ink-900">Column A — Student Number</span> (required)
              </li>
              <li>
                <span className="font-medium text-ink-900">Column B — Full Name</span> (optional)
              </li>
            </ul>
            <p className="mt-2">
              New students are created automatically; students already in the system are linked.
              Empty rows and rows without a student number are skipped.
            </p>
          </div>
          <input
            ref={fileInput}
            type="file"
            accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onFile(f);
            }}
          />
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="secondary" onClick={() => fileInput.current?.click()}>
              Choose file…
            </Button>
            {fileName && (
              <span className="text-xs text-ink-600">
                {fileName} — <span className="font-semibold text-brand-700">{rows.length}</span> row
                {rows.length === 1 ? '' : 's'}
              </span>
            )}
            {rows.length > 0 && (
              <Button onClick={() => void startImport()} disabled={busy}>
                {busy ? 'Submitting…' : `Import ${rows.length} student${rows.length === 1 ? '' : 's'}`}
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Running / finished: progress bar + report. */}
      {jobId && (
        <div className="space-y-4">
          <div>
            <div className="mb-1.5 flex items-center justify-between text-xs">
              <span className="text-ink-600">
                {jobStatus === 'FAILED'
                  ? 'Import failed'
                  : terminal
                    ? 'Import complete'
                    : `Processing… ${processed}/${total}`}
              </span>
              <span className="font-semibold text-brand-700">{pct}%</span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full border border-line bg-section">
              <div
                className={`h-full rounded-full transition-all duration-300 ${jobStatus === 'FAILED' ? 'bg-red-600' : 'bg-brand-700'}`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>

          {counts && (
            <div className="flex flex-wrap gap-2">
              <Badge tone="green">created {counts.created}</Badge>
              <Badge tone="indigo">enrolled {counts.enrolled}</Badge>
              <Badge tone="gray">already {counts.already}</Badge>
              <Badge tone="red">failed {counts.failed}</Badge>
            </div>
          )}

          {terminal && report.length > 0 && (
            <div className="max-h-64 overflow-auto rounded border border-line">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-section font-semibold text-brand-900">
                  <tr>
                    <th className="px-3 py-2">#</th>
                    <th className="px-3 py-2">Student number</th>
                    <th className="px-3 py-2">Result</th>
                    <th className="px-3 py-2">Detail</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {report.map((r) => (
                    <tr key={r.row} className="odd:bg-white even:bg-section/40">
                      <td className="px-3 py-1.5 text-ink-400">{r.row}</td>
                      <td className="px-3 py-1.5 text-ink-900">{r.studentNumber}</td>
                      <td className="px-3 py-1.5">
                        <Badge tone={ROW_TONE[r.status]}>{r.status}</Badge>
                      </td>
                      <td className="px-3 py-1.5 text-ink-600">{r.message ?? ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {terminal && (
            <Button variant="secondary" onClick={reset}>
              Import another file
            </Button>
          )}
        </div>
      )}
    </Panel>
  );
}
