'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { api, ApiError } from '@/lib/api';
import type { Student } from '@/lib/types';
import { Button, Input, Panel } from '@/components/ui';

const message = (err: unknown) => (err instanceof ApiError ? err.message : 'Something went wrong');

/**
 * Add a single student to a course roster. Typing the student number runs a
 * debounced search; picking a suggestion locks in an existing student (fast
 * path → "Enroll"), while a brand-new number falls through to find-or-create on
 * the backend (→ "Add"). Either way the old create-then-link conflict is gone.
 */
export function RosterAddForm({ courseId, onChanged }: { courseId: string; onChanged: () => void }) {
  const [studentNumber, setStudentNumber] = useState('');
  const [fullName, setFullName] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null); // set => existing student picked
  const [suggestions, setSuggestions] = useState<Student[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const skipNext = useRef(false); // suppress the search that selecting a suggestion would trigger

  // Debounced search-as-you-type on the student-number field.
  useEffect(() => {
    if (skipNext.current) {
      skipNext.current = false;
      return;
    }
    if (selectedId || studentNumber.trim().length < 2) {
      setSuggestions([]);
      return;
    }
    const t = setTimeout(() => {
      api
        .listStudents(studentNumber.trim())
        .then((res) => {
          setSuggestions(res.data);
          setOpen(true);
        })
        .catch(() => {
          /* search is best-effort */
        });
    }, 250);
    return () => clearTimeout(t);
  }, [studentNumber, selectedId]);

  const pick = (s: Student) => {
    skipNext.current = true;
    setSelectedId(s.id);
    setStudentNumber(s.studentNumber);
    setFullName(s.fullName);
    setOpen(false);
  };

  // Editing the number again clears a prior selection so the name field re-enables.
  const onNumberChange = (v: string) => {
    setStudentNumber(v);
    if (selectedId) {
      setSelectedId(null);
      setFullName('');
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setNote(null);
    setError(null);
    try {
      const res = await api.enroll(
        courseId,
        selectedId
          ? { studentId: selectedId }
          : { studentNumber: studentNumber.trim(), fullName: fullName.trim() },
      );
      const name = res.enrollment.student.fullName;
      setNote(
        res.alreadyEnrolled
          ? `${name} is already on this roster.`
          : res.created
            ? `Created and enrolled ${name}.`
            : `Enrolled ${name}.`,
      );
      setStudentNumber('');
      setFullName('');
      setSelectedId(null);
      setSuggestions([]);
      onChanged();
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel title="Add student to roster">
      <form onSubmit={submit} className="flex flex-col gap-3 sm:flex-row">
        <div className="relative sm:flex-1">
          <Input
            placeholder="Student number"
            value={studentNumber}
            onChange={(e) => onNumberChange(e.target.value)}
            onFocus={() => suggestions.length > 0 && setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 120)}
            required
          />
          {open && suggestions.length > 0 && (
            <ul className="absolute z-10 mt-1 max-h-56 w-full overflow-auto rounded border border-line bg-white shadow-lg">
              {suggestions.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => pick(s)}
                    className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm text-ink-900 transition-colors duration-150 hover:bg-section"
                  >
                    <span>{s.fullName}</span>
                    <span className="text-ink-400">{s.studentNumber}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <Input
          placeholder="Full name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          disabled={!!selectedId}
          required={!selectedId}
          className="sm:flex-1"
        />
        <Button type="submit" disabled={busy}>
          {busy ? '…' : selectedId ? 'Enroll' : 'Add'}
        </Button>
      </form>
      {note && <p className="mt-2 text-xs text-ink-600">{note}</p>}
      {error && <p className="mt-2 text-xs text-red-700">{error}</p>}
    </Panel>
  );
}
