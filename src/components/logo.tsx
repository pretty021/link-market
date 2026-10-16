import Link from 'next/link';
import { cn } from '@/lib/utils';

/**
 * The inonlink logo (mark + wordmark) from public/brand. Two versions are rendered and the
 * theme shows one: navy/teal on light backgrounds, white/mint on dark.
 */
export function Logo({ href = '/', className }: { href?: string; className?: string }) {
  return (
    <Link href={href} aria-label="inonlink home" className={cn('flex shrink-0 items-center', className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/inonlink-logo-light.svg" alt="inonlink" width={443} height={120} className="h-7 w-auto sm:h-8 dark:hidden" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/inonlink-logo-dark.svg" alt="inonlink" width={443} height={120} className="hidden h-7 w-auto sm:h-8 dark:block" />
    </Link>
  );
}
