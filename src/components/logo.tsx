import Link from 'next/link';
import { cn } from '@/lib/utils';

/**
 * The "link / in" mark, drawn as SVG so it follows the theme (colors from --logo-* in globals.css):
 * light = pale blue tile with navy letters, dark = deep navy tile with white letters and a glowing ring.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={cn('shrink-0', className)} role="img" aria-label="inonlink">
      <rect width="64" height="64" rx="15" fill="rgb(var(--logo-bg))" />
      <rect
        x="10.5"
        y="8.5"
        width="43"
        height="20"
        rx="10"
        fill="none"
        stroke="rgb(var(--logo-ring))"
        strokeWidth="2.2"
        style={{ filter: 'drop-shadow(0 0 calc(var(--logo-glow) * 2.5px) rgb(var(--logo-ring)))' }}
      />
      <text x="32" y="23.6" textAnchor="middle" fontSize="14" fontWeight="700" fill="rgb(var(--logo-fg))" fontFamily="inherit" letterSpacing="-0.3">
        link
      </text>
      <text x="32" y="55" textAnchor="middle" fontSize="27" fontWeight="800" fill="rgb(var(--logo-fg))" fontFamily="inherit" letterSpacing="-1">
        in
      </text>
    </svg>
  );
}

/**
 * The mark already says "link" and "in", so only "on" sits beside it: together they read in·on·link.
 * Brand blue, heavy weight, sized to the mark's height. Follows the theme via --mint.
 */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span aria-hidden="true" className={cn('text-[1.6rem] font-extrabold leading-none tracking-[-0.04em] text-brand-mint', className)}>
      on
    </span>
  );
}

export function Logo({ href = '/', className, showName = true }: { href?: string; className?: string; showName?: boolean }) {
  return (
    <Link href={href} aria-label="inonlink home" className={cn('flex items-center gap-1.5', className)}>
      <LogoMark className="size-9 rounded-xl shadow-soft" />
      {showName && <Wordmark />}
    </Link>
  );
}
