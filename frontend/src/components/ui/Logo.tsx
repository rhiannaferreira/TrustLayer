import { useId } from 'react';
import { cn } from '@/lib/cn';

/** TrustLayer mark: a shield outline enclosing a three-node trust network. */
export function LogoMark({ className }: { className?: string }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg viewBox="0 0 32 32" fill="none" className={cn('h-7 w-7', className)} aria-hidden>
      <defs>
        <linearGradient id={`tl-${id}`} x1="4" y1="2" x2="28" y2="30" gradientUnits="userSpaceOnUse">
          <stop stopColor="rgb(var(--accent))" />
          <stop offset="1" stopColor="rgb(var(--violet))" />
        </linearGradient>
      </defs>
      <path d="M16 2.5 27 6.6v8.2c0 6.9-4.6 12.4-11 14.7C9.6 27.2 5 21.7 5 14.8V6.6L16 2.5Z" stroke={`url(#tl-${id})`} strokeWidth="2" strokeLinejoin="round" fill="rgb(var(--accent) / 0.06)" />
      <path d="M16 11 11 18.5h10L16 11Z" stroke={`url(#tl-${id})`} strokeWidth="1.3" strokeLinejoin="round" opacity="0.8" />
      <circle cx="16" cy="11" r="2.1" fill="rgb(var(--accent))" />
      <circle cx="11" cy="18.5" r="2.1" fill="rgb(var(--violet))" />
      <circle cx="21" cy="18.5" r="2.1" fill="rgb(var(--violet))" />
    </svg>
  );
}

export function Logo({ compact }: { compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2">
      <LogoMark />
      {!compact && (
        <span className="text-[15px] font-semibold tracking-tight text-ink">
          Trust<span className="text-accent-soft">Layer</span>
        </span>
      )}
    </span>
  );
}
