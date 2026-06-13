import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

const buttonVariants: Record<ButtonVariant, string> = {
  primary: 'bg-brand-900 text-white hover:bg-brand-800 disabled:bg-brand-700/60',
  secondary: 'border border-line bg-white text-ink-900 hover:bg-section',
  danger: 'bg-red-700 text-white hover:bg-red-600 disabled:bg-red-300',
  ghost: 'text-link hover:bg-section',
};

export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded px-3.5 py-2 text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-700/40 disabled:cursor-not-allowed disabled:opacity-70 ${buttonVariants[variant]} ${className}`}
      {...props}
    />
  );
}

export function Input({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`w-full rounded border border-line bg-white px-3 py-2 text-sm text-ink-900 outline-none transition-colors duration-150 placeholder:text-ink-400 focus:border-brand-700 focus:ring-2 focus:ring-brand-700/20 disabled:bg-section disabled:opacity-70 ${className}`}
      {...props}
    />
  );
}

/** Plain white content box. Use `interactive` for clickable cards (tiles). */
export function Card({
  children,
  className = '',
  interactive = false,
}: {
  children: ReactNode;
  className?: string;
  interactive?: boolean;
}) {
  return (
    <div
      className={`rounded-md border border-line bg-panel p-5 shadow-sm ${
        interactive ? 'transition-all duration-150 hover:border-brand-700/50 hover:shadow-md' : ''
      } ${className}`}
    >
      {children}
    </div>
  );
}

/** Titled panel — the classic UBIS section with a light blue-gray header bar. */
export function Panel({
  title,
  action,
  children,
  className = '',
}: {
  title?: ReactNode;
  /** Optional node rendered at the right of the header bar. */
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-md border border-line bg-panel shadow-sm ${className}`}>
      {(title || action) && (
        <div className="flex items-center justify-between gap-3 rounded-t-md border-b border-line bg-section px-4 py-2">
          <h2 className="text-sm font-semibold text-brand-900">{title}</h2>
          {action}
        </div>
      )}
      <div className="p-4">{children}</div>
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 text-sm text-ink-600">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-brand-700" />
      {label}
    </div>
  );
}

type BadgeTone = 'green' | 'amber' | 'red' | 'gray' | 'indigo';
const badgeTones: Record<BadgeTone, string> = {
  green: 'bg-green-100 text-green-800 ring-1 ring-inset ring-green-300',
  amber: 'bg-amber-100 text-amber-800 ring-1 ring-inset ring-amber-300',
  red: 'bg-red-100 text-red-800 ring-1 ring-inset ring-red-300',
  gray: 'bg-section text-ink-600 ring-1 ring-inset ring-line',
  indigo: 'bg-blue-100 text-blue-800 ring-1 ring-inset ring-blue-300',
};

export function Badge({ tone = 'gray', children }: { tone?: BadgeTone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${badgeTones[tone]}`}
    >
      {children}
    </span>
  );
}

export function Alert({ tone = 'red', children }: { tone?: 'red' | 'amber' | 'green'; children: ReactNode }) {
  const tones = {
    red: 'border-red-300 bg-red-50 text-red-800',
    amber: 'border-amber-300 bg-amber-50 text-amber-800',
    green: 'border-green-400 bg-green-50 text-green-800',
  };
  return <div className={`rounded border px-3.5 py-2.5 text-sm ${tones[tone]}`}>{children}</div>;
}
