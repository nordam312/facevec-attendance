'use client';

import Link from 'next/link';
import { useAuth } from '../lib/auth';
import { Button } from './ui';

export function Nav() {
  const { user, logout } = useAuth();
  return (
    <header className="border-b border-neutral-200 bg-white/80 backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/80">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3">
        <Link href="/courses" className="flex items-center gap-2 font-semibold tracking-tight">
          <span className="text-indigo-500">●</span> FaceVec
        </Link>
        <div className="flex items-center gap-3 text-sm">
          {user && (
            <span className="text-neutral-500 dark:text-neutral-400">
              {user.displayName} · <span className="uppercase">{user.role.toLowerCase()}</span>
            </span>
          )}
          <Button variant="ghost" onClick={() => void logout()}>
            Sign out
          </Button>
        </div>
      </div>
    </header>
  );
}
