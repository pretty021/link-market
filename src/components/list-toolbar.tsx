'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Search, SlidersHorizontal, X } from 'lucide-react';
import type { Post } from '@/lib/client/types';
import { cn } from '@/lib/utils';

export type SortKey =
  | 'updated'
  | 'newest'
  | 'oldest'
  | 'connects-desc'
  | 'connects-asc'
  | 'price-desc'
  | 'price-asc'
  | 'views'
  | 'title';

export const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'updated', label: 'Recently updated' },
  { value: 'newest', label: 'Newest uploaded' },
  { value: 'oldest', label: 'Oldest uploaded' },
  { value: 'connects-desc', label: 'Connects: high to low' },
  { value: 'connects-asc', label: 'Connects: low to high' },
  { value: 'price-desc', label: 'Price: high to low' },
  { value: 'price-asc', label: 'Price: low to high' },
  { value: 'views', label: 'Most viewed' },
  { value: 'title', label: 'Name: A to Z' },
];

/** Which part of a listing the search box looks in. */
export type SearchField = 'all' | 'title' | 'seller' | 'buyer';

const FIELD_LABELS: Record<SearchField, string> = {
  all: 'All',
  title: 'Name',
  seller: 'Seller',
  buyer: 'Buyer',
};

const FIELD_PLACEHOLDERS: Record<SearchField, string> = {
  all: 'Search…',
  title: 'Link name…',
  seller: 'Seller name…',
  buyer: 'Buyer name…',
};

/**
 * One-tap sort buttons. Tapping the active button flips direction when it has two
 * (first key = arrow down: newest / highest first; second = arrow up).
 */
export const SORT_GROUPS: { label: string; keys: [SortKey] | [SortKey, SortKey]; hint: [string] | [string, string] }[] = [
  { label: 'New', keys: ['newest', 'oldest'], hint: ['Newest first', 'Oldest first'] },
  { label: 'Updated', keys: ['updated'], hint: ['Last updated first'] },
  { label: 'Price', keys: ['price-desc', 'price-asc'], hint: ['Highest price first', 'Lowest price first'] },
  { label: 'Connects', keys: ['connects-desc', 'connects-asc'], hint: ['Most connects first', 'Fewest connects first'] },
  { label: 'Views', keys: ['views'], hint: ['Most viewed first'] },
  { label: 'A–Z', keys: ['title'], hint: ['By name, A to Z'] },
];

export type StatusOption = { value: string; label: string; match: (p: Post) => boolean };

const time = (s: string | null | undefined) => (s ? new Date(s).getTime() : 0);
// Missing prices sort last in both directions.
const price = (p: Post, dir: 1 | -1) => (p.price === null ? Number.POSITIVE_INFINITY : dir * p.price);

const comparators: Record<SortKey, (a: Post, b: Post) => number> = {
  updated: (a, b) => time(b.updatedAt) - time(a.updatedAt),
  newest: (a, b) => time(b.createdAt) - time(a.createdAt),
  oldest: (a, b) => time(a.createdAt) - time(b.createdAt),
  'connects-desc': (a, b) => b.connects - a.connects,
  'connects-asc': (a, b) => a.connects - b.connects,
  'price-desc': (a, b) => price(a, -1) - price(b, -1),
  'price-asc': (a, b) => price(a, 1) - price(b, 1),
  views: (a, b) => b.viewCount - a.viewCount,
  title: (a, b) => (a.name || a.title).localeCompare(b.name || b.title, undefined, { sensitivity: 'base', numeric: true }),
};

const statusWords: Record<Post['status'], string> = {
  REQUESTED: 'requested awaiting',
  PUBLISHED: 'published available live',
  PROGRESSING: 'in progress progressing held hold',
  COMPLETED: 'completed sold purchased done',
};

function haystack(p: Post, field: SearchField) {
  switch (field) {
    case 'title':
      return `${p.name ?? ''} ${p.title}`.toLowerCase();
    case 'seller':
      return p.clientName.toLowerCase();
    case 'buyer':
      return (p.holderName ?? '').toLowerCase();
    default:
      return [p.name ?? '', p.title, p.clientName, p.holderName ?? '', statusWords[p.status], p.price !== null ? p.price.toFixed(2) : '']
        .join(' ')
        .toLowerCase();
  }
}

type Saved = { q: string; field: SearchField; status: string; sort: SortKey };

/**
 * Search (in a chosen field) / status filter / sort for a list of posts. Runs on the already-loaded,
 * live-updating list, so results change instantly. Choices are remembered for the browser session.
 */
export function useListControls(
  storageKey: string,
  statusOptions: StatusOption[],
  defaultSort: SortKey = 'updated',
  fields: SearchField[] = ['all', 'title', 'seller', 'buyer'],
  sortable = true,
  /** Sort buttons to offer, by label (default: all of SORT_GROUPS). */
  sortLabels?: string[],
) {
  const sortGroups = sortLabels ? SORT_GROUPS.filter((g) => sortLabels.includes(g.label)) : SORT_GROUPS;
  const defaults: Saved = { q: '', field: 'all', status: statusOptions[0]!.value, sort: defaultSort };
  const [q, setQState] = useState(defaults.q);
  const [field, setFieldState] = useState<SearchField>(defaults.field);
  const [status, setStatusState] = useState(defaults.status);
  const [sort, setSortState] = useState<SortKey>(defaults.sort);
  const current = useRef<Saved>(defaults);
  const key = `list:${storageKey}`;

  // Saved only on real user changes (never from an effect), so a mount can't overwrite a saved choice.
  const save = useCallback(
    (patch: Partial<Saved>) => {
      current.current = { ...current.current, ...patch };
      try {
        sessionStorage.setItem(key, JSON.stringify(current.current));
      } catch {
        // Ignore: remembering choices is a convenience.
      }
    },
    [key],
  );
  const setQ = useCallback((v: string) => (setQState(v), save({ q: v })), [save]);
  const setField = useCallback((v: SearchField) => (setFieldState(v), save({ field: v })), [save]);
  const setStatus = useCallback((v: string) => (setStatusState(v), save({ status: v })), [save]);
  const setSort = useCallback((v: SortKey) => (setSortState(v), save({ sort: v })), [save]);

  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(key) ?? 'null') as Partial<Saved> | null;
      if (!saved) return;
      const next: Saved = {
        q: typeof saved.q === 'string' ? saved.q : defaults.q,
        field: saved.field && fields.includes(saved.field) ? saved.field : defaults.field,
        status: statusOptions.some((o) => o.value === saved.status) ? saved.status! : defaults.status,
        sort: sortGroups.some((g) => (g.keys as SortKey[]).includes(saved.sort!)) ? saved.sort! : defaults.sort,
      };
      current.current = next;
      setQState(next.q);
      setFieldState(next.field);
      setStatusState(next.status);
      setSortState(next.sort);
    } catch {
      // Storage unavailable: start from defaults.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  function apply(posts: Post[] | null) {
    if (!posts) return { shown: null as Post[] | null, counts: {} as Record<string, number>, total: 0 };
    const terms = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const searched = terms.length ? posts.filter((p) => terms.every((t) => haystack(p, field).includes(t))) : posts;
    const counts = Object.fromEntries(statusOptions.map((o) => [o.value, searched.filter(o.match).length]));
    const option = statusOptions.find((o) => o.value === status) ?? statusOptions[0]!;
    const matched = searched.filter(option.match);
    const shown = sortable ? matched.sort(comparators[sort]) : matched;
    return { shown, counts, total: posts.length };
  }

  const isDefault = q.trim() === '' && field === defaults.field && status === defaults.status && (!sortable || sort === defaultSort);
  const reset = () => {
    setQ('');
    setField(defaults.field);
    setStatus(defaults.status);
    setSort(defaultSort);
  };

  return { q, setQ, field, setField, fields, status, setStatus, sort, setSort, apply, isDefault, reset, statusOptions, sortable, sortGroups };
}

type Controls = ReturnType<typeof useListControls>;

function Group({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('min-w-0', className)}>
      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-lo">{label}</p>
      {children}
    </div>
  );
}

const chevron = (
  <svg className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-ink-lo" viewBox="0 0 20 20" aria-hidden="true">
    <path d="M5.5 7.5 10 12l4.5-4.5" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const chip = (active: boolean) =>
  cn(
    'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition',
    active ? 'border-primary bg-primary text-on-primary' : 'border-line text-ink-mid hover:bg-bg-elev hover:text-ink-hi',
  );

/**
 * Search (field + text), Status chips with live counts, and one-tap Sort buttons.
 * layout="bar" spreads across a page; layout="stack" fits a narrow side panel.
 */
export function ListToolbar({
  controls,
  counts,
  shown,
  total,
  layout = 'bar',
  countStyle = 'text',
  className,
}: {
  controls: Controls;
  counts: Record<string, number>;
  shown: number;
  total: number;
  layout?: 'bar' | 'stack';
  /** `badge` puts the live count in a chip on the search row. `text` keeps the "N total" line. */
  countStyle?: 'text' | 'badge';
  className?: string;
}) {
  const { q, setQ, field, setField, fields, status, setStatus, sort, setSort, isDefault, reset, statusOptions, sortable, sortGroups } = controls;
  const [draft, setDraft] = useState(q);
  const stack = layout === 'stack';
  const showStatus = statusOptions.length > 1;
  const showSort = sortable;

  // Debounce typing slightly; keep the box in sync when q is reset or restored.
  useEffect(() => setDraft(q), [q]);
  useEffect(() => {
    if (draft === q) return;
    const t = setTimeout(() => setQ(draft), 120);
    return () => clearTimeout(t);
  }, [draft, q, setQ]);

  const summary = useMemo(() => (shown === total ? `${total} total` : `${shown} of ${total}`), [shown, total]);
  const filtered = shown !== total;
  const empty = shown === 0;

  const countBadge = (
    <span
      aria-live="polite"
      title={filtered ? `${shown} of ${total} match` : `${total} in this list`}
      className={cn(
        'inline-flex h-10 shrink-0 items-center gap-2 rounded-lg border px-3',
        empty ? 'border-state-err/30 bg-state-err/10' : filtered ? 'border-brand-purple/30 bg-brand-purple/10' : 'border-brand-mint/25 bg-brand-mint/10',
      )}
    >
      <span className={cn('size-2 rounded-full', empty ? 'bg-state-err' : filtered ? 'bg-brand-purple' : 'bg-brand-mint')} />
      <span className={cn('text-base font-bold tabular-nums leading-none', empty ? 'text-state-err' : filtered ? 'text-brand-purple' : 'text-brand-mint')}>
        {shown}
      </span>
      <span className="flex flex-col leading-none">
        {filtered && <span className="text-[10px] font-semibold tabular-nums text-ink-lo">of {total}</span>}
        <span className="text-[10px] font-semibold uppercase tracking-wide text-ink-mid">{filtered ? (shown === 1 ? 'match' : 'matches') : 'in queue'}</span>
      </span>
    </span>
  );

  const search = (
    <Group label="Search" className={stack ? undefined : 'flex-1'}>
      <div className="flex items-center gap-2">
        {fields.length > 1 && (
          <label className={cn('relative shrink-0', stack ? 'w-28' : 'w-32')}>
            <span className="sr-only">Search in</span>
            <select value={field} onChange={(e) => setField(e.target.value as SearchField)} className="field cursor-pointer appearance-none pr-8">
              {fields.map((f) => (
                <option key={f} value={f}>
                  {FIELD_LABELS[f]}
                </option>
              ))}
            </select>
            {chevron}
          </label>
        )}
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">Search</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-lo" />
          <input
            type="search"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={FIELD_PLACEHOLDERS[field]}
            className="field pl-9 pr-9 [&::-webkit-search-cancel-button]:hidden"
          />
          {draft && (
            <button
              type="button"
              onClick={() => setDraft('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-ink-lo hover:bg-bg-elev hover:text-ink-hi"
              aria-label="Clear search"
            >
              <X className="size-3.5" />
            </button>
          )}
        </label>
        {countStyle === 'badge' && countBadge}
        {countStyle === 'badge' && !isDefault && (
          <button type="button" onClick={reset} className="shrink-0 text-xs font-semibold text-brand-mint hover:underline">
            Clear
          </button>
        )}
      </div>
    </Group>
  );

  const statusGroup = (
    <Group label="Status">
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by status">
        {statusOptions.map((o) => (
          <button key={o.value} type="button" onClick={() => setStatus(o.value)} aria-pressed={status === o.value} className={chip(status === o.value)}>
            {o.label}
            <span className={cn('tabular-nums', status === o.value ? 'text-on-primary/80' : 'text-ink-lo')}>{counts[o.value] ?? 0}</span>
          </button>
        ))}
      </div>
    </Group>
  );

  const sortGroup = (
    <Group label="Sort">
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Sort">
        {sortGroups.map((g) => {
          const idx = g.keys.indexOf(sort);
          const active = idx !== -1;
          const flips = g.keys.length === 2;
          const hint = active ? g.hint[idx]! : g.hint[0];
          return (
            <button
              key={g.label}
              type="button"
              title={flips && active ? `${hint} · tap to flip` : hint}
              aria-label={hint}
              aria-pressed={active}
              onClick={() => setSort(active && flips ? g.keys[idx === 0 ? 1 : 0]! : g.keys[0])}
              className={chip(active)}
            >
              {g.label}
              {active && flips && (idx === 0 ? <ArrowDown className="size-3.5" /> : <ArrowUp className="size-3.5" />)}
            </button>
          );
        })}
      </div>
    </Group>
  );

  const footer = (
    <div className="flex items-center gap-3 text-xs text-ink-lo">
      <span aria-live="polite">{summary}</span>
      {!isDefault && (
        <button type="button" onClick={reset} className="font-semibold text-brand-mint hover:underline">
          Clear
        </button>
      )}
    </div>
  );

  if (stack) {
    return (
      <div className={cn('space-y-4', className)}>
        {search}
        {showStatus && statusGroup}
        {showSort && sortGroup}
        <div className="flex justify-between border-t border-line pt-3">{footer}</div>
      </div>
    );
  }

  return (
    <div className={cn('space-y-3', className)}>
      {search}
      {countStyle === 'text' && (showStatus || showSort) && (
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex flex-col gap-3 sm:flex-row sm:gap-8">
            {showStatus && statusGroup}
            {showSort && sortGroup}
          </div>
          {footer}
        </div>
      )}
      {countStyle === 'text' && !(showStatus || showSort) && footer}
      {countStyle === 'badge' && (showStatus || showSort) && (
        <div className="flex flex-col gap-3 sm:flex-row sm:gap-8">
          {showStatus && statusGroup}
          {showSort && sortGroup}
        </div>
      )}
    </div>
  );
}

/** Small header for a side panel that hosts the stacked toolbar. */
export function ToolbarPanelTitle() {
  return (
    <span className="flex items-center gap-2">
      <SlidersHorizontal className="size-4 text-ink-lo" /> Filter
    </span>
  );
}

export const STAFF_STATUS_OPTIONS: StatusOption[] = [
  { value: 'all', label: 'All', match: () => true },
  { value: 'REQUESTED', label: 'Requested', match: (p) => p.status === 'REQUESTED' },
  { value: 'PUBLISHED', label: 'Published', match: (p) => p.status === 'PUBLISHED' },
  { value: 'PROGRESSING', label: 'In progress', match: (p) => p.status === 'PROGRESSING' },
  { value: 'COMPLETED', label: 'Completed', match: (p) => p.status === 'COMPLETED' },
];

export const CUSTOMER_STATUS_OPTIONS: StatusOption[] = [
  { value: 'all', label: 'All', match: () => true },
  { value: 'PUBLISHED', label: 'Available', match: (p) => p.status === 'PUBLISHED' },
  { value: 'PROGRESSING', label: 'In progress', match: (p) => p.status === 'PROGRESSING' },
  { value: 'COMPLETED', label: 'Bought', match: (p) => p.status === 'COMPLETED' },
];
