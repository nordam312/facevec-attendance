'use client';

import { useEffect, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { Spinner } from '@/components/ui';

export default function AppLayout({ children }: { children: ReactNode }) {
  const { status, user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (status === 'unauthenticated') router.replace('/login');
  }, [status, router]);

  if (status !== 'authenticated') {
    return (
      <div className="grid flex-1 place-items-center py-24">
        <Spinner label="Loading…" />
      </div>
    );
  }

  const onCourses = pathname?.startsWith('/courses') ?? false;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-5">
      <div className="grid gap-4 md:grid-cols-[210px_1fr]">
        {/* Main-menu sidebar */}
        <aside className="h-fit overflow-hidden rounded-md border border-line bg-panel shadow-sm">
          <div className="border-b border-line bg-section px-4 py-2 text-sm font-bold text-maroon">
            Main Menu
          </div>
          <nav className="space-y-0.5 p-2 text-sm">
            <Link
              href="/courses"
              className={`block rounded px-3 py-1.5 transition-colors ${
                onCourses ? 'font-semibold text-brand-900' : 'text-link hover:bg-section'
              }`}
            >
              • Courses
            </Link>
          </nav>
          {user && (
            <div className="border-t border-line px-4 py-3 text-xs text-ink-600">
              <p className="font-semibold text-ink-900">{user.displayName}</p>
              <p className="uppercase tracking-wide text-ink-400">{user.role.toLowerCase()}</p>
            </div>
          )}
        </aside>

        <main className="min-w-0 space-y-4">{children}</main>
      </div>
    </div>
  );
}
