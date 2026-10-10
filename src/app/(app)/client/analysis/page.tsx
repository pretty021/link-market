'use client';

import { useCallback, useEffect, useState } from 'react';
import { PageTitle } from '@/components/app-shell';
import { useOnReconnect, useSocketEvent } from '@/components/providers/realtime';
import { Card, Spinner } from '@/components/ui/primitives';
import { api } from '@/lib/client/api';
import type { Post } from '@/lib/client/types';
import { cn, formatPrice } from '@/lib/utils';

type Period = {
  key: string;
  label: string;
  range: string;
  wash: string;
  text: string;
  bar: string;
  from: number | null;
};

export default function ClientAnalysisPage() {
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    const next = (await api<{ posts: Post[] }>('/api/client/posts')).posts;
    setPosts(next);
    setNow(Date.now());
  }, []);

  useEffect(() => {
    void load();
  }, [load]);
  useOnReconnect(load);
  useSocketEvent('post:updated', () => void load());
  useSocketEvent('post:published', () => void load());
  useSocketEvent('post:expired', () => void load());
  useSocketEvent('post:requested', () => void load());
  useSocketEvent('post:deleted', () => void load());

  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);
  const monthStart = new Date(dayStart.getFullYear(), dayStart.getMonth(), 1);
  const periods: Period[] = [
    {
      key: 'today',
      label: 'Today',
      range: dayStart.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }),
      wash: 'bg-brand-mint/10',
      text: 'text-brand-mint',
      bar: 'bg-brand-mint',
      from: dayStart.getTime(),
    },
    {
      key: 'month',
      label: 'This month',
      range: monthStart.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }),
      wash: 'bg-brand-purple/10',
      text: 'text-brand-purple',
      bar: 'bg-brand-purple',
      from: monthStart.getTime(),
    },
    {
      key: 'all',
      label: 'All time',
      range: 'Every accepted account',
      wash: 'bg-state-ok/10',
      text: 'text-state-ok',
      bar: 'bg-state-ok',
      from: null,
    },
  ];

  return (
    <>
      <PageTitle title="Selling analysis" subtitle="Today, this month, and everything you have sold." />
      {posts === null ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-3">
          {periods.map((period) => (
            <PeriodCard key={period.key} period={period} report={sellingReport(posts, period.from)} />
          ))}
        </div>
      )}
    </>
  );
}

function sellingReport(posts: Post[], from: number | null) {
  const accepted = posts.filter((p) => p.approval);
  const inWindow = (p: Post) => p.status === 'COMPLETED' && !!p.completedAt && (from === null || new Date(p.completedAt).getTime() >= from);
  const sold = accepted.filter(inWindow);
  const pool = from === null ? accepted : accepted.filter((p) => p.status !== 'COMPLETED' || inWindow(p));
  const revenue = sold.reduce((sum, p) => sum + (p.price ?? 0), 0);
  const pct = pool.length > 0 ? Math.round((sold.length / pool.length) * 100) : 0;
  const sales = [...sold].sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''));
  return { sold: sold.length, open: pool.length - sold.length, pool: pool.length, revenue, pct, sales };
}

function PeriodCard({ period, report }: { period: Period; report: ReturnType<typeof sellingReport> }) {
  return (
    <Card className="overflow-hidden p-0">
      <div className={cn('px-5 py-4', period.wash)}>
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-lo">{period.label}</p>
            <p className="mt-1 text-xs text-ink-mid">{period.range}</p>
          </div>
          <p className={cn('text-4xl font-bold tabular-nums leading-none', period.text)}>{report.pct}%</p>
        </div>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-bg-card" aria-hidden="true">
          <div className={cn('h-full rounded-full', period.bar)} style={{ width: `${report.pct}%` }} />
        </div>
        <p className="mt-2 text-xs text-ink-mid">
          <span className="font-semibold tabular-nums text-ink-hi">{report.sold}</span> of {report.pool} accounts sold
        </p>
      </div>
      <div className="grid grid-cols-3 divide-x divide-line border-b border-line">
        <Metric label="Sold" value={String(report.sold)} />
        <Metric label="Still open" value={String(report.open)} />
        <Metric label="Revenue" value={formatPrice(report.revenue)} />
      </div>
      {report.sales.length === 0 ? (
        <p className="px-5 py-6 text-sm text-ink-mid">No accounts sold in this period.</p>
      ) : (
        <ul className="max-h-80 divide-y divide-line/60 overflow-y-auto">
          {report.sales.map((post) => {
            const when = post.completedAt ? new Date(post.completedAt) : null;
            return (
              <li key={post.id} className="flex items-center gap-3 px-4 py-3">
                <div className="size-10 shrink-0 overflow-hidden rounded-lg bg-bg-elev">
                  {post.image?.url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={post.image.url} alt="" className="size-full object-cover" />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src="/post-default.jpg" alt="" className="size-full object-cover" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ink-hi">{post.name?.trim() || post.title}</p>
                  {when && (
                    <p className="text-[11px] tabular-nums text-ink-lo">
                      {when.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                      <span className="px-1">·</span>
                      {when.toLocaleDateString([], { month: 'short', day: 'numeric' })}
                    </p>
                  )}
                </div>
                <p className="shrink-0 text-sm font-bold tabular-nums">{formatPrice(post.price)}</p>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-3 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-lo">{label}</p>
      <p className="mt-1 truncate text-sm font-bold tabular-nums text-ink-hi">{value}</p>
    </div>
  );
}
