'use client';

import { useEffect, useId, useState, type ReactNode } from 'react';
import { Check, Clock3, Link2 } from 'lucide-react';
import { Avatar } from '@/components/ui/primitives';
import type { ImageInfo, Post } from '@/lib/client/types';
import { kindLogoSrc, type AccountKind } from '@/lib/account-kinds';
import { postHref } from '@/components/post-bits';
import { cn, formatPrice } from '@/lib/utils';

/** The "link / in" mark on its own (colors from --cover-link / --cover-in, so it follows the theme). */
function LinkInMark({ className }: { className?: string }) {
  const id = useId().replace(/:/g, '');
  const v = (name: string) => `rgb(var(--cover-${name}))`;
  return (
    <svg viewBox="300 40 370 390" role="img" aria-label="LinkedIn account" className={className}>
      <defs>
        <filter id={`${id}shadow`} x="-30%" y="-30%" width="160%" height="170%">
          <feDropShadow dx="0" dy="12" stdDeviation="16" style={{ floodColor: v('shadow') }} floodOpacity="0.3" />
        </filter>
      </defs>
      <g filter={`url(#${id}shadow)`}>
        {/* "in" without the dot: the word "link" sits where the dot would be. */}
        <g transform="translate(202 -19) scale(11)" style={{ fill: v('in') }}>
          <rect x="9.9" y="18.6" width="6.6" height="20.4" rx="0.3" />
          <path d="M20.9 18.6H27.2V21.4C28.1 19.7 30.3 18.1 33.6 18.1C40.3 18.1 41.5 22.5 41.5 28.2V39H34.9V29.4C34.9 27.1 34.8 24.2 31.7 24.2C28.5 24.2 28 26.7 28 29.3V39H20.9Z" />
        </g>
        <text x="484" y="178" textAnchor="middle" fontSize="152" fontWeight="800" letterSpacing="-4" style={{ fill: v('link'), fontFamily: 'inherit' }}>
          link
        </text>
      </g>
    </svg>
  );
}

// Cover tints (colours per theme are in globals.css, .acc-cover[data-tint=...]).
const COVER_TINTS = ['blue', 'orange', 'green', 'purple'] as const;

/** Same account, same colour: a small stable hash of the name picks the tint. */
export function coverTint(name: string) {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return COVER_TINTS[hash % COVER_TINTS.length]!;
}

/** Account types shown with the account card (the rest keep their simpler card). */
export const CARD_KINDS: ReadonlySet<AccountKind> = new Set<AccountKind>(['LINKEDIN', 'GV', 'GMAIL']);
export const usesAccountCard = (kind?: AccountKind | null) => CARD_KINDS.has(kind ?? 'LINKEDIN');

/** Area code of a phone number: "+1(919) 483-3934" -> "919", "+1 919 483 3934" / "9194833934" -> "919". */
function areaCode(phone: string) {
  const inBrackets = /\((\d{2,4})\)/.exec(phone)?.[1];
  if (inBrackets) return inBrackets;
  const digits = phone.replace(/\D/g, '');
  // US / Canada: an optional leading country code 1, then the 3-digit area code.
  return digits.length === 11 && digits.startsWith('1') ? digits.slice(1, 4) : digits.slice(0, 3);
}

/**
 * "Gregory Yunker" -> "GY", "Test1" -> "T", "1234" -> "12", "+1(919) 483-3934" -> "919" (the phone number's
 * area code), "abc@gmail.com" -> "A" (the part before the @). Links are ignored.
 */
export function accountInitials(name: string) {
  const trimmed = name.trim();
  if (/^[\d\s()+\-.]+$/.test(trimmed) && trimmed.replace(/\D/g, '').length >= 7) return areaCode(trimmed);
  if (/^[^\s@]+@[^\s@]+$/.test(trimmed)) return trimmed[0]!.toUpperCase();
  const words = name
    .replace(/https?:\/\/\S*/gi, '')
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
  if (words.length === 0) return 'in';
  if (words.length === 1) return /^\d/.test(words[0]!) ? words[0]!.slice(0, 2) : words[0]![0]!.toUpperCase();
  return (words[0]![0]! + words[1]![0]!).toUpperCase();
}

/**
 * LinkedIn account cover: a pastel panel tinted per account, the "link / in" tile, the connects
 * count, the account photo (or initials) in a circle, and the initials faded in the corner.
 * Tints are in globals.css (.acc-cover): pastel in the light theme, deep banner colours in the dark theme.
 */
export function AccountCover({ name, photo, connects, kind }: { name: string; photo?: string | null; connects?: number; kind?: AccountKind | null }) {
  const logo = kindLogoSrc(kind);
  const initials = accountInitials(name);
  return (
    <div className="acc-cover relative size-full overflow-hidden" data-tint={coverTint(name)}>
      {/* Faded initials, bottom-right */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-[18%] -right-[3%] select-none text-[8.5rem] font-extrabold leading-none tracking-tighter"
        style={{ color: 'var(--acc-faint)' }}
      >
        {initials}
      </span>
      <span className="absolute left-3 top-3 flex size-11 items-center justify-center rounded-xl shadow-soft" style={{ background: 'var(--tile-bg)' }}>
        {logo ? (
          // GV / Gmail / …: the service logo on a white chip.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logo} alt="" className="size-[78%] rounded-lg bg-white object-contain p-1" />
        ) : (
          <LinkInMark className="h-[62%] w-auto" />
        )}
      </span>
      {connects !== undefined && (
        <span
          className="absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold shadow-soft [&_svg]:size-4"
          style={{ background: 'var(--pill-bg)', color: 'var(--pill-fg)' }}
        >
          <Link2 /> {connects} connects
        </span>
      )}
      <span
        className="absolute left-1/2 top-[58%] flex aspect-square h-[62%] -translate-x-1/2 -translate-y-1/2 items-center justify-center overflow-hidden rounded-full border shadow-lift"
        style={{ background: 'var(--circle-bg)', borderColor: 'var(--circle-border)' }}
      >
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo} alt="" className="size-full object-cover" />
        ) : (
          <span className="text-4xl font-extrabold tracking-tight" style={{ color: 'var(--acc)' }}>
            {initials}
          </span>
        )}
      </span>
    </div>
  );
}

/** Small square picture of an account: its photo, or its initials on the account's cover colour. */
export function AccountThumb({ name, photo, className }: { name: string; photo?: string | null; className?: string }) {
  return (
    <span
      className={cn('acc-cover relative flex shrink-0 items-center justify-center overflow-hidden rounded-2xl', className)}
      data-tint={coverTint(name)}
    >
      {photo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photo} alt="" className="size-full object-cover" />
      ) : (
        <span className="text-xl font-extrabold" style={{ color: 'var(--acc)' }}>
          {accountInitials(name)}
        </span>
      )}
    </span>
  );
}

/** A coloured dot with a short label ("Available", "In progress", …). */
export function StatusDot({ tone, children }: { tone: 'ok' | 'purple' | 'amber' | 'mint' | 'lo'; children: ReactNode }) {
  const color = { ok: 'text-state-ok', purple: 'text-brand-purple', amber: 'text-state-warn', mint: 'text-brand-mint', lo: 'text-ink-lo' }[tone];
  return (
    <span className={cn('inline-flex items-center gap-2 text-sm font-semibold', color)}>
      <span className="size-2 rounded-full bg-current" />
      {children}
    </span>
  );
}

/** Small fact under the name ("0 viewing", "12 views"). */
export function Chip({ icon, children }: { icon?: ReactNode; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-sm text-ink-mid [&_svg]:size-4 [&_svg]:shrink-0">
      {icon}
      {children}
    </span>
  );
}

/** "Just now", "5 mins", "3 hours" (whole hours are enough once past the first hour). */
function sinceLabel(ms: number) {
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} min${mins === 1 ? '' : 's'}`;
  const hours = Math.floor(mins / 60);
  return `${hours} hour${hours === 1 ? '' : 's'}`;
}

/** Re-renders every minute so "5 mins" keeps counting. */
function useMinuteClock() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

/** Updated today: a pill with how long ago ("5 mins"). Earlier days: time and date. */
export function UpdatedStamp({ when }: { when: Date }) {
  const now = useMinuteClock();
  const today = new Date(now).toDateString() === when.toDateString();
  const time = when.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (today) {
    return (
      <time
        dateTime={when.toISOString()}
        title={`Updated today at ${time}`}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-brand-mint/10 px-2.5 py-1 text-xs font-bold tabular-nums text-brand-mint"
      >
        <Clock3 className="size-3.5" />
        {sinceLabel(Math.max(0, now - when.getTime()))}
      </time>
    );
  }
  return (
    <time dateTime={when.toISOString()} className="shrink-0 text-right leading-tight tabular-nums">
      <span className="block text-sm font-bold text-ink-hi">{time}</span>
      <span className="block text-xs text-ink-lo">{when.toLocaleDateString([], { month: 'short', day: 'numeric' })}</span>
    </time>
  );
}

export type CardPerson = {
  name: string;
  image: ImageInfo | null;
  /** "Seller", "Buyer", … */
  label: string;
  verified?: boolean;
  /** Shows a green / grey dot on the photo. */
  online?: boolean;
};

/**
 * The LinkedIn account card used on the Customer and Client pages:
 * status + time, cover with the account photo, name, link, chips, a person row, then price and an action.
 */
export function LinkedInCard({
  post,
  badges,
  connects,
  chips,
  person,
  personStatus,
  action,
  onOpen,
  className,
  headerClassName,
}: {
  post: Pick<Post, 'name' | 'title' | 'price' | 'image' | 'updatedAt'> & { kind?: AccountKind | null };
  badges: ReactNode;
  /** Shown on the cover. */
  connects?: number;
  chips?: ReactNode;
  person?: CardPerson | null;
  /** Right side of the person row, e.g. the seller's Available / Away status. */
  personStatus?: ReactNode;
  action?: ReactNode;
  onOpen?: () => void;
  className?: string;
  headerClassName?: string;
}) {
  const when = new Date(post.updatedAt);
  const href = postHref(post.title);
  const heading = post.name?.trim() || post.title;
  const cover = <AccountCover name={heading} photo={post.image?.url} connects={connects} kind={post.kind} />;
  return (
    <article className={cn('flex h-full flex-col overflow-hidden rounded-2xl border border-line bg-bg-card shadow-soft', className)}>
      <header className={cn('flex items-start justify-between gap-2 px-4 py-3', headerClassName)}>
        <div className="flex min-w-0 flex-wrap items-center gap-1">{badges}</div>
        <UpdatedStamp when={when} />
      </header>

      <div className="px-3">
        {onOpen ? (
          <button type="button" onClick={onOpen} className="block aspect-[1.9/1] w-full overflow-hidden rounded-2xl" aria-label={`Open ${heading}`}>
            {cover}
          </button>
        ) : (
          <div className="aspect-[1.9/1] w-full overflow-hidden rounded-2xl">{cover}</div>
        )}
      </div>

      <div className="flex-1 space-y-2 px-4 pb-4 pt-3.5">
        <div className="space-y-0.5">
          {onOpen ? (
            <button type="button" onClick={onOpen} className="line-clamp-1 text-left text-lg font-extrabold leading-snug hover:text-brand-mint [overflow-wrap:anywhere]">
              {heading}
            </button>
          ) : (
            <p className="line-clamp-1 text-lg font-extrabold leading-snug [overflow-wrap:anywhere]">{heading}</p>
          )}
          {post.name?.trim() &&
            (href ? (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer nofollow"
                title="Open link in a new tab"
                className="line-clamp-1 block text-sm text-brand-mint hover:underline [overflow-wrap:anywhere]"
              >
                {post.title.replace(/^https?:\/\/(www\.)?/i, '')}
              </a>
            ) : (
              <p className="line-clamp-1 text-sm text-brand-mint [overflow-wrap:anywhere]">{post.title}</p>
            ))}
        </div>
        {chips && <div className="flex flex-wrap items-center gap-2">{chips}</div>}
      </div>

      {(person || personStatus) && (
        <div className="flex items-center justify-between gap-3 border-t border-line/70 px-4 py-3">
          {person ? (
            <div className="flex min-w-0 items-center gap-3">
              <Avatar name={person.name} src={person.image?.url} size={40} online={person.online} />
              <div className="min-w-0 leading-tight">
                <p className="flex items-center gap-1.5 font-bold">
                  <span className="truncate">{person.name}</span>
                  {person.verified && (
                    <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-primary text-on-primary" aria-label="Verified">
                      <Check className="size-3" strokeWidth={3} />
                    </span>
                  )}
                </p>
                <p className="text-xs text-ink-lo">{person.label}</p>
              </div>
            </div>
          ) : (
            <span />
          )}
          <div className="shrink-0">{personStatus}</div>
        </div>
      )}

      <footer className="mt-auto flex items-end justify-between gap-3 border-t border-line/70 px-4 py-3.5">
        <div className="leading-tight">
          <p className="text-xs text-ink-lo">Price</p>
          <p className="text-2xl font-extrabold tabular-nums">{formatPrice(post.price)}</p>
        </div>
        {action}
      </footer>
    </article>
  );
}

