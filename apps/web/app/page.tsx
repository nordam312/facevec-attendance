export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-6 px-6">
      <div>
        <p className="text-sm font-medium uppercase tracking-widest text-indigo-500">
          FaceVec Attendance
        </p>
        <h1 className="mt-2 text-4xl font-bold tracking-tight">
          Distributed Face Attendance Checker
        </h1>
        <p className="mt-4 text-neutral-600 dark:text-neutral-400">
          Phase 0 skeleton. The professor dashboard, enrollment UI, and the
          real-time attendance WebSocket feed are delivered in Phase 7.
        </p>
      </div>
      <code className="w-fit rounded-md bg-neutral-100 px-3 py-1 text-sm dark:bg-neutral-900">
        GET /api/health → {`{ status: "ok" }`}
      </code>
    </main>
  );
}
