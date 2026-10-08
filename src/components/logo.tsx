import Link from 'next/link';
import { cn } from '@/lib/utils';

export function Logo({ href = '/', className }: { href?: string; className?: string }) {
  return (
    <Link href={href} className={cn('flex items-center gap-2 text-lg font-bold tracking-tight', className)}>
      <span className="flex size-8 items-center justify-center rounded-xl bg-grad-mint shadow-glow">
        <svg viewBox="0 0 24 24" className="size-4 text-bg-deep" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
          <path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1" />
          <path d="M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1" />
        </svg>
      </span>
      <span>
        Link<span className="text-brand-mint">Market</span>
      </span>
    </Link>
  );
}
