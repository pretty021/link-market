'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ArrowRight, BadgeCheck, Briefcase, LayoutGrid, Mail, MessageCircle, Phone, Send, ShoppingCart, type LucideIcon } from 'lucide-react';
import { accountInitials, coverTint } from '@/components/linkedin-card';
import { DEFAULT_ACCOUNT_IMAGE, type AccountKind } from '@/lib/account-kinds';
import { cn, formatPrice } from '@/lib/utils';

export type LandingListing = {
  id: string;
  kind: AccountKind;
  name: string | null;
  title: string;
  price: number | null;
  connects: number;
  photo: string | null;
  seller: string;
  sellerPhoto: string | null;
};

type Tab = 'ALL' | AccountKind;

const TABS: { id: Tab; label: string; icon: LucideIcon; tone: string }[] = [
  { id: 'ALL', label: 'All', icon: LayoutGrid, tone: 'bg-primary/15 text-primary' },
  { id: 'LINKEDIN', label: 'LinkedIn', icon: Briefcase, tone: 'bg-primary/15 text-primary' },
  { id: 'GV', label: 'Google Voice', icon: Phone, tone: 'bg-state-ok/15 text-state-ok' },
  { id: 'GMAIL', label: 'Gmail', icon: Mail, tone: 'bg-ink-hi/10 text-ink-hi' },
  { id: 'WHATSAPP', label: 'WhatsApp', icon: MessageCircle, tone: 'bg-state-ok/15 text-state-ok' },
  { id: 'TELEGRAM', label: 'Telegram', icon: Send, tone: 'bg-primary/15 text-primary' },
];

const KIND_CHIP: Record<AccountKind, string> = {
  LINKEDIN: 'LinkedIn',
  GV: 'Google Voice',
  GMAIL: 'Gmail',
  WHATSAPP: 'WhatsApp',
  TELEGRAM: 'Telegram',
};

/** The small grey line under the name. */
function subline(l: LandingListing) {
  if (l.kind === 'LINKEDIN') return l.name ? l.title.replace(/^https?:\/\/(www\.)?/i, '') : null;
  if (l.kind === 'GV') {
    const area = /\((\d{3})\)/.exec(l.title)?.[1] ?? /^\+?1?\D*(\d{3})/.exec(l.title)?.[1];
    return area ? `US number · area code ${area}` : 'Google Voice number';
  }
  return `Ready ${KIND_CHIP[l.kind]} account`;
}

function ListingCard({ l }: { l: LandingListing }) {
  const heading = l.name?.trim() || l.title;
  const initials = accountInitials(heading);
  const sub = subline(l);
  return (
    <Link href="/register" className="group flex h-full min-w-0 flex-col rounded-2xl border border-line bg-bg-card p-2 shadow-soft transition hover:-translate-y-0.5 hover:shadow-lift">
      <div className="acc-cover relative aspect-[1.9/1] overflow-hidden rounded-xl" data-tint={coverTint(heading)}>
        <span aria-hidden="true" className="pointer-events-none absolute -bottom-[16%] -right-[2%] select-none font-display text-[6.5rem] font-bold leading-none tracking-tighter" style={{ color: 'var(--acc-faint)' }}>
          {initials}
        </span>
        <span className="absolute left-2 top-2 rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: 'var(--pill-bg)', color: 'var(--pill-fg)' }}>
          {KIND_CHIP[l.kind]}
        </span>
        {l.kind === 'LINKEDIN' && (
          <span className="absolute right-2 top-2 rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums" style={{ background: 'var(--pill-bg)', color: 'var(--pill-fg)' }}>
            {l.connects} connects
          </span>
        )}
        <span
          className="absolute left-1/2 top-[55%] flex aspect-square h-[52%] -translate-x-1/2 -translate-y-1/2 items-center justify-center overflow-hidden rounded-full border shadow-lift"
          style={{ background: 'var(--circle-bg)', borderColor: 'var(--circle-border)' }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={l.photo ?? DEFAULT_ACCOUNT_IMAGE} alt="" className="size-full object-cover" />
        </span>
      </div>
      <div className="flex flex-1 flex-col px-2 pb-1.5 pt-3">
        <p className="truncate font-semibold text-ink-hi">{heading}</p>
        {sub && <p className={cn('truncate text-xs', l.kind === 'LINKEDIN' ? 'text-brand-mint' : 'text-ink-lo')}>{sub}</p>}
        <p className="mt-2.5 flex items-center gap-1.5 text-xs text-ink-mid">
          {l.sellerPhoto ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={l.sellerPhoto} alt="" className="size-4 rounded-full object-cover" />
          ) : (
            <span className="flex size-4 items-center justify-center rounded-full bg-primary/15 text-[8px] font-bold text-primary">{l.seller[0]?.toUpperCase()}</span>
          )}
          <span className="truncate">{l.seller}</span>
          <BadgeCheck className="size-3.5 shrink-0 text-primary" aria-label="Reviewed seller" />
        </p>
        <div className="mt-auto flex items-center justify-between gap-2 pt-3">
          <span className="font-display text-lg font-bold tabular-nums text-ink-hi">{formatPrice(l.price)}</span>
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-on-primary transition group-hover:bg-primary-hover">
            <ShoppingCart className="size-3.5" /> Add
          </span>
        </div>
      </div>
    </Link>
  );
}

/** Marketplace preview: type tabs with live counts, and the newest listings of the chosen type. */
export function LandingMarket({ listings, counts }: { listings: LandingListing[]; counts: Record<AccountKind, number> }) {
  const [tab, setTab] = useState<Tab>('ALL');
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const shown = (tab === 'ALL' ? listings : listings.filter((l) => l.kind === tab)).slice(0, 4);
  const count = (t: Tab) => (t === 'ALL' ? total : counts[t]);

  return (
    <>
      <div className="mt-8 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap" role="tablist" aria-label="Account types">
        {TABS.map(({ id, label, icon: Icon, tone }) => {
          const n = count(id);
          const soon = id !== 'ALL' && n === 0;
          const active = tab === id;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={active}
              disabled={soon}
              onClick={() => setTab(id)}
              className={cn(
                'flex items-center gap-2.5 rounded-xl border px-2 py-2 pr-3 text-sm font-medium transition',
                active ? 'border-primary/60 bg-primary/10 text-ink-hi' : 'border-line bg-bg-card text-ink-mid hover:text-ink-hi',
                soon && 'cursor-not-allowed opacity-50 hover:text-ink-mid',
              )}
            >
              <span className={cn('flex size-7 items-center justify-center rounded-lg', tone)}>
                <Icon className="size-4" />
              </span>
              <span className="truncate">{label}</span>
              <span className={cn('ml-auto rounded-md px-1.5 text-xs tabular-nums', active ? 'bg-primary/20 text-primary' : 'bg-bg-elev text-ink-lo')}>
                {soon ? 'Soon' : n}
              </span>
            </button>
          );
        })}
      </div>

      {shown.length === 0 ? (
        <p className="mt-8 rounded-2xl border border-dashed border-line px-6 py-12 text-center text-sm text-ink-lo">New listings appear here as soon as they are reviewed.</p>
      ) : (
        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 [&>*]:min-w-0">
          {shown.map((l) => (
            <ListingCard key={l.id} l={l} />
          ))}
        </div>
      )}

      {total > 0 && (
        <div className="mt-8 flex justify-center">
          <Link href="/register" className="inline-flex items-center gap-2 rounded-xl border border-line bg-bg-card px-5 py-2.5 text-sm font-semibold text-ink-hi transition hover:bg-bg-elev">
            View all {total} account{total === 1 ? '' : 's'} <ArrowRight className="size-4" />
          </Link>
        </div>
      )}
    </>
  );
}
