'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '../lib/auth';

/**
 * University header: a navy identity band (seal + name) over a dark secondary
 * navigation strip — the UBIS portal layout. Shown on every page.
 */
export function Nav() {
  const { user, status, logout } = useAuth();
  const pathname = usePathname();
  const onCourses = pathname?.startsWith('/courses') ?? false;

  return (
    <header>
      {/* University identity band — official navy with the white logo (cropped
          from the brand banner, so the navy matches the band exactly). */}
      <div className="bg-brand-900 text-white">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-6 py-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/iau-logo-white.png" alt="Istanbul Aydin University" className="h-12 w-auto" />
          <div className="border-l border-white/25 pl-4 leading-tight">
            <p className="text-base font-semibold tracking-wide">FaceVec</p>
            <p className="text-xs italic text-white/70">Attendance System</p>
          </div>
        </div>
      </div>

      {/* Dark secondary navigation strip */}
      <div className="bg-navbar text-white">
        <div className="mx-auto flex max-w-6xl items-center justify-end gap-5 px-6 py-2 text-sm">
          <Link
            href="/courses"
            className={`transition-colors hover:text-white ${onCourses ? 'font-semibold text-white' : 'text-white/80'}`}
          >
            Home
          </Link>
          {status === 'authenticated' ? (
            <>
              {user && (
                <span className="hidden text-white/60 sm:inline">
                  {user.displayName} ·{' '}
                  <span className="uppercase">{user.role.toLowerCase()}</span>
                </span>
              )}
              <button
                onClick={() => void logout()}
                className="text-white/80 transition-colors hover:text-white"
              >
                Sign out
              </button>
            </>
          ) : (
            <Link href="/login" className="text-white/80 transition-colors hover:text-white">
              Sign in
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
