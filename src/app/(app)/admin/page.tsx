'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { BadgeCheck, CalendarCheck, CheckCircle2, Inbox, Save, Search, Timer, Trash2, UserCheck, Users } from 'lucide-react';
import { PageTitle } from '@/components/app-shell';
import { ListToolbar, useListControls } from '@/components/list-toolbar';
import { ImageUpload, PostImage, postHref } from '@/components/post-bits';
import { useOnReconnect, useSocketEvent } from '@/components/providers/realtime';
import { useToast } from '@/components/providers/toast';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Avatar, Card, CardHeader, Empty, Field, Input, Label, Spinner } from '@/components/ui/primitives';
import { api, ApiError } from '@/lib/client/api';
import type { ImageInfo, Post } from '@/lib/client/types';
import { ACCOUNT_KIND_LABEL, DEFAULT_ACCOUNT_IMAGE, coverClass, coverSrc, kindLogoSrc } from '@/lib/account-kinds';
import { formatPrice } from '@/lib/utils';

type Stats = { clientsOnline: number; clientsTotal: number; customersOnline: number; customersTotal: number; requested: number; progressing: number };

const statTones = {
  ok: { rail: 'bg-state-ok', chip: 'bg-state-ok/10 text-state-ok', bar: 'bg-state-ok' },
  purple: { rail: 'bg-brand-purple', chip: 'bg-brand-purple/10 text-brand-purple', bar: 'bg-brand-purple' },
  mint: { rail: 'bg-brand-mint', chip: 'bg-brand-mint/10 text-brand-mint', bar: 'bg-brand-mint' },
  warn: { rail: 'bg-state-warn', chip: 'bg-state-warn/10 text-state-warn', bar: 'bg-state-warn' },
} as const;

function StatCard({
  icon,
  label,
  value,
  total,
  caption,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  total?: number;
  caption: string;
  tone: keyof typeof statTones;
}) {
  const t = statTones[tone];
  const ratio = total !== undefined ? (total > 0 ? Math.min(1, value / total) : 0) : null;
  return (
    <Card className="flex overflow-hidden p-0">
      <div className={`w-1 shrink-0 ${t.rail}`} />
      <div className="flex min-w-0 flex-1 flex-col p-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-lo">{label}</p>
          <div className={`flex size-9 shrink-0 items-center justify-center rounded-full ${t.chip}`}>{icon}</div>
        </div>
        <p className="mt-3 text-4xl font-bold tabular-nums leading-none tracking-tight">{value}</p>
        {ratio !== null ? (
          <div className="mt-auto pt-3">
            <div className="h-1.5 overflow-hidden rounded-full bg-bg-elev" aria-hidden="true">
              <div className={`h-full rounded-full ${t.bar}`} style={{ width: `${Math.round(ratio * 100)}%` }} />
            </div>
            <p className="mt-2 text-xs text-ink-mid">
              <span className="font-semibold tabular-nums text-ink-hi">{value}</span> of {total} {caption}
            </p>
          </div>
        ) : (
          <p className="mt-auto pt-3 text-xs text-ink-mid">{caption}</p>
        )}
      </div>
    </Card>
  );
}

function SoldProgress({ posts }: { posts: Post[] | null }) {
  const [open, setOpen] = useState(false);
  const report = accountReport(posts ?? []);
  const pct = report.accepted > 0 ? Math.round((report.sold / report.accepted) * 100) : 0;
  return (
    <>
      <Card className="overflow-hidden p-0">
        <button type="button" onClick={() => setOpen(true)} className="w-full px-5 py-4 text-left transition hover:bg-bg-elev/50" aria-label="Open sold account analysis">
          <div className="flex items-center gap-4">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-state-ok/10 text-state-ok">
              <BadgeCheck className="size-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-lo">Sold progress</p>
                <p className="text-sm font-bold tabular-nums text-state-ok">{pct}%</p>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-bg-elev" aria-hidden="true">
                <div className="h-full rounded-full bg-state-ok transition-[width] duration-500" style={{ width: `${pct}%` }} />
              </div>
              <p className="mt-2 text-xs text-ink-mid">
                <span className="font-semibold tabular-nums text-ink-hi">{report.sold}</span> of {report.accepted} accepted accounts sold
                <span className="ml-2 font-semibold text-brand-mint">View analysis</span>
              </p>
            </div>
          </div>
        </button>
      </Card>
      <SoldAnalysis open={open} onClose={() => setOpen(false)} report={report} />
    </>
  );
}

type SellerRow = { id: string; name: string; sold: number; live: number; revenue: number };

function accountReport(posts: Post[]) {
  const accepted = posts.filter((p) => p.approval);
  const soldPosts = accepted.filter((p) => p.status === 'COMPLETED');
  const live = accepted.filter((p) => p.status === 'PUBLISHED').length;
  const holding = accepted.filter((p) => p.status === 'PROGRESSING').length;
  const revenue = soldPosts.reduce((sum, p) => sum + (p.price ?? 0), 0);
  const openValue = accepted.filter((p) => p.status !== 'COMPLETED').reduce((sum, p) => sum + (p.price ?? 0), 0);
  const priced = soldPosts.filter((p) => p.price !== null);
  const average = priced.length ? revenue / priced.length : 0;
  const waits = soldPosts.flatMap((p) => {
    if (!p.completedAt || !p.approvedAt) return [];
    const days = (new Date(p.completedAt).getTime() - new Date(p.approvedAt).getTime()) / 86_400_000;
    return days >= 0 ? [days] : [];
  });
  const averageDays = waits.length ? waits.reduce((sum, n) => sum + n, 0) / waits.length : null;
  const bySeller = new Map<string, SellerRow>();
  for (const post of accepted) {
    const row = bySeller.get(post.clientId) ?? { id: post.clientId, name: post.clientName, sold: 0, live: 0, revenue: 0 };
    if (post.status === 'COMPLETED') {
      row.sold += 1;
      row.revenue += post.price ?? 0;
    } else row.live += 1;
    bySeller.set(post.clientId, row);
  }
  const sellers = [...bySeller.values()].sort((a, b) => b.sold - a.sold || b.revenue - a.revenue);
  const recent = [...soldPosts].sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? '')).slice(0, 6);
  return { accepted: accepted.length, sold: soldPosts.length, live, holding, revenue, openValue, average, averageDays, sellers, recent };
}

function isToday(iso: string | null) {
  if (!iso) return false;
  const date = new Date(iso);
  const now = new Date();
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
}

function TodaySoldProgress({ posts }: { posts: Post[] | null }) {
  const [open, setOpen] = useState(false);
  const pool = (posts ?? []).filter((p) => p.approval && (p.status !== 'COMPLETED' || isToday(p.completedAt)));
  const report = accountReport(pool);
  const pct = report.accepted > 0 ? Math.round((report.sold / report.accepted) * 100) : 0;
  const when = new Date().toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
  return (
    <>
      <Card className="overflow-hidden p-0">
        <button type="button" onClick={() => setOpen(true)} className="w-full px-5 py-4 text-left transition hover:bg-bg-elev/50" aria-label="Open today's sold account analysis">
          <div className="flex items-center gap-4">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-mint/10 text-brand-mint">
              <CalendarCheck className="size-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-lo">Today&apos;s sold progress</p>
                <p className="text-sm font-bold tabular-nums text-brand-mint">{pct}%</p>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-bg-elev" aria-hidden="true">
                <div className="h-full rounded-full bg-brand-mint transition-[width] duration-500" style={{ width: `${pct}%` }} />
              </div>
              <p className="mt-2 text-xs text-ink-mid">
                <span className="font-semibold tabular-nums text-ink-hi">{report.sold}</span> of {report.accepted} accounts sold today
                <span className="ml-2 text-ink-lo">{when}</span>
                <span className="ml-2 font-semibold text-brand-mint">View analysis</span>
              </p>
            </div>
          </div>
        </button>
      </Card>
      <SoldAnalysis
        open={open}
        onClose={() => setOpen(false)}
        report={report}
        title="Today's account analysis"
        lead={`${pct}% of accounts available today are sold.`}
        totalLabel={`${report.accepted} available today`}
      />
    </>
  );
}

function SoldAnalysis({
  open,
  onClose,
  report,
  title = 'Account analysis',
  lead,
  totalLabel,
}: {
  open: boolean;
  onClose: () => void;
  report: ReturnType<typeof accountReport>;
  title?: string;
  lead?: string;
  totalLabel?: string;
}) {
  const pct = report.accepted > 0 ? Math.round((report.sold / report.accepted) * 100) : 0;
  const parts = [
    { label: 'Sold', count: report.sold, bar: 'bg-state-ok' },
    { label: 'In progress', count: report.holding, bar: 'bg-state-warn' },
    { label: 'Still listed', count: report.live, bar: 'bg-brand-mint' },
  ];
  const pace = report.averageDays === null ? 'Not enough timing yet' : report.averageDays < 1 ? 'Same day' : `${Math.round(report.averageDays)} day${Math.round(report.averageDays) === 1 ? '' : 's'}`;
  const topSold = Math.max(1, ...report.sellers.map((s) => s.sold));

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent title={title} description={lead ?? `${pct}% of accepted accounts are sold.`} className="max-w-2xl">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Metric label="Sold" value={String(report.sold)} />
          <Metric label="Still open" value={String(report.live + report.holding)} />
          <Metric label="Sold revenue" value={formatPrice(report.revenue)} />
          <Metric label="Average sale" value={formatPrice(report.average)} />
        </div>

        <div className="mt-5">
          <div className="mb-2 flex items-center justify-between text-xs text-ink-lo">
            <span className="font-semibold uppercase tracking-[0.12em]">Pipeline</span>
            <span>{totalLabel ?? `${report.accepted} accepted`}</span>
          </div>
          <div className="flex h-3 overflow-hidden rounded-full bg-bg-elev">
            {report.accepted === 0 ? null : parts.map((part) => (
              <div key={part.label} className={part.bar} style={{ width: `${(part.count / report.accepted) * 100}%` }} title={`${part.label}: ${part.count}`} />
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-mid">
            {parts.map((part) => (
              <span key={part.label} className="inline-flex items-center gap-1.5">
                <span className={`size-2 rounded-full ${part.bar}`} />
                {part.label} <span className="font-semibold tabular-nums text-ink-hi">{part.count}</span>
              </span>
            ))}
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <Metric label="Open inventory" value={formatPrice(report.openValue)} hint="Price still listed or in progress" />
          <Metric label="Accept to sale" value={pace} hint="Average across sold accounts" />
        </div>

        <div className="mt-6">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-lo">By seller</p>
          {report.sellers.length === 0 ? (
            <p className="mt-2 text-sm text-ink-mid">No accepted accounts yet.</p>
          ) : (
            <ul className="mt-2 divide-y divide-line/60">
              {report.sellers.map((seller) => (
                <li key={seller.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-ink-hi">{seller.name}</p>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-bg-elev">
                      <div className="h-full rounded-full bg-state-ok" style={{ width: `${(seller.sold / topSold) * 100}%` }} />
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold tabular-nums text-ink-hi">{seller.sold} sold</p>
                    <p className="text-[11px] tabular-nums text-ink-lo">{seller.live} open · {formatPrice(seller.revenue)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {report.recent.length > 0 && (
          <div className="mt-6">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-lo">Latest sales</p>
            <ul className="mt-2 divide-y divide-line/60">
              {report.recent.map((post) => {
                const when = post.completedAt ? new Date(post.completedAt) : null;
                return (
                  <li key={post.id} className="flex items-center gap-3 py-2.5">
                    <div className="size-10 shrink-0 overflow-hidden rounded-lg bg-bg-elev ring-1 ring-line/70">
                      <PostImage image={post.image} title={post.title} kind={post.kind} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-ink-hi">{post.name?.trim() || post.title}</p>
                      <p className="truncate text-[11px] text-ink-lo">
                        {post.clientName}
                        {when && (
                          <>
                            <span className="px-1 text-line">·</span>
                            {when.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                          </>
                        )}
                      </p>
                    </div>
                    <p className="shrink-0 text-sm font-bold tabular-nums">{formatPrice(post.price)}</p>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-line bg-bg-base/60 px-3 py-2.5">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-lo">{label}</p>
      <p className="mt-1 truncate text-lg font-bold tabular-nums text-ink-hi">{value}</p>
      {hint && <p className="mt-0.5 text-[11px] text-ink-lo">{hint}</p>}
    </div>
  );
}

function upsertPost(prev: Post[] | null, post: Post) {
  const list = prev ?? [];
  return list.some((p) => p.id === post.id) ? list.map((p) => (p.id === post.id ? post : p)) : [post, ...list];
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [showAllAccepted, setShowAllAccepted] = useState(false);
  const requests = useListControls('admin-dashboard-requests', [{ value: 'all', label: 'All', match: () => true }], 'newest', ['all', 'title', 'seller'], false);
  const statsGen = useRef(0);
  const postsGen = useRef(0);

  const loadStats = useCallback(async () => {
    const gen = ++statsGen.current;
    const next = (await api<{ stats: Stats }>('/api/admin/stats')).stats;
    if (gen === statsGen.current) setStats(next);
  }, []);
  const loadPosts = useCallback(async () => {
    const gen = ++postsGen.current;
    const next = (await api<{ posts: Post[] }>('/api/admin/posts')).posts;
    if (gen === postsGen.current) setPosts(next);
  }, []);

  useEffect(() => {
    void loadStats();
    void loadPosts();
    const id = setInterval(() => void loadStats(), 30_000);
    return () => clearInterval(id);
  }, [loadStats, loadPosts]);
  useOnReconnect(() => {
    void loadStats();
    void loadPosts();
  });

  useSocketEvent<{ stats?: Stats }>('presence:update', (p) => (p.stats ? setStats(p.stats) : void loadStats()));
  useSocketEvent<{ posts: Post[] }>('post:requested', ({ posts: created }) => {
    if (!created?.length) return;
    setPosts((prev) => created.reduce((list, post) => upsertPost(list, post), prev ?? []));
    void loadPosts();
    void loadStats();
  });
  useSocketEvent<{ post: Post }>('post:published', ({ post }) => {
    setPosts((prev) => upsertPost(prev, post));
    void loadStats();
  });
  useSocketEvent<{ post: Post }>('post:updated', ({ post }) => {
    setPosts((prev) => upsertPost(prev, post));
    void loadStats();
  });
  useSocketEvent<{ postId: string }>('post:deleted', ({ postId }) => {
    setPosts((prev) => prev?.filter((p) => p.id !== postId) ?? prev);
    void loadStats();
  });

  const pending = posts?.filter((p) => p.status === 'REQUESTED' && !p.approval) ?? null;
  const accepted =
    posts
      ?.filter((p) => p.approval)
      .slice()
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()) ?? null;
  const requestView = requests.apply(pending);

  return (
    <>
      <PageTitle title="Requests" subtitle="Live overview." />
      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard icon={<UserCheck className="size-4" />} label="Clients" value={stats?.clientsOnline ?? 0} total={stats?.clientsTotal ?? 0} caption="online" tone="ok" />
        <StatCard icon={<Users className="size-4" />} label="Customers" value={stats?.customersOnline ?? 0} total={stats?.customersTotal ?? 0} caption="online" tone="purple" />
        <StatCard icon={<Inbox className="size-4" />} label="Requests" value={stats?.requested ?? 0} caption="waiting to accept" tone="mint" />
        <StatCard icon={<Timer className="size-4" />} label="In progress" value={stats?.progressing ?? 0} caption="on the clock" tone="warn" />
      </div>
      <div className="mb-8 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SoldProgress posts={posts} />
        <TodaySoldProgress posts={posts} />
      </div>

      <div className="grid grid-cols-1 items-start gap-6 md:grid-cols-[7fr_3fr]">
        <Card className="min-w-0">
          <CardHeader title="Link requests" subtitle="Name, price, save, accept." icon={<Inbox className="size-5" />} />
          {pending === null ? (
            <div className="flex justify-center py-12"><Spinner /></div>
          ) : pending.length === 0 ? (
            <Empty icon={<CheckCircle2 />} title="No pending requests" hint="New requests appear live." />
          ) : (
            <>
              <div className="border-b border-line/60 px-4 py-4">
                <ListToolbar
                  controls={requests}
                  counts={requestView.counts}
                  shown={requestView.shown?.length ?? 0}
                  total={requestView.total}
                  countStyle="badge"
                />
              </div>
              {requestView.shown!.length === 0 ? (
                <Empty icon={<Search />} title="No matching requests" hint="Try another seller, title, or clear the search." />
              ) : (
                <ul className="space-y-4 bg-bg-base/70 p-4">
                  {requestView.shown!.map((p) => (
                    <RequestRow
                      key={p.id}
                      post={p}
                      onDone={(next) => setPosts((prev) => (next ? upsertPost(prev, next) : prev?.filter((x) => x.id !== p.id) ?? prev))}
                    />
                  ))}
                </ul>
              )}
            </>
          )}
        </Card>

        <Card className="min-w-0">
          <CardHeader title="Accepted" subtitle="Name, connects, price and image." icon={<CheckCircle2 className="size-5" />} />
          {accepted === null ? (
            <div className="flex justify-center py-12"><Spinner /></div>
          ) : accepted.length === 0 ? (
            <Empty icon={<CheckCircle2 />} title="No accepted links" hint="Accepted requests show up here." />
          ) : (
            <>
              <ul className="divide-y divide-line/50">
                {(showAllAccepted ? accepted : accepted.slice(0, 3)).map((p) => (
                  <AcceptedRow key={p.id} post={p} />
                ))}
              </ul>
              {accepted.length > 3 && !showAllAccepted && (
                <div className="border-t border-line/50 p-3">
                  <Button variant="ghost" className="w-full" onClick={() => setShowAllAccepted(true)}>
                    View more
                  </Button>
                </div>
              )}
            </>
          )}
        </Card>
      </div>
    </>
  );
}

function RequestRow({ post, onDone }: { post: Post; onDone: (next?: Post) => void }) {
  const toast = useToast();
  const [name, setName] = useState(post.name ?? '');
  const [title, setTitle] = useState(post.title);
  const [deleting, setDeleting] = useState(false);
  const [image, setImage] = useState<ImageInfo | null>(post.image);
  const [detailImage, setDetailImage] = useState<ImageInfo | null>(post.detailImage);
  const [connects, setConnects] = useState(String(post.connects));
  const [price, setPrice] = useState(post.price !== null ? post.price.toFixed(2) : '');
  const [saving, setSaving] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [saved, setSaved] = useState(post);
  const linkedIn = (post.kind ?? 'LINKEDIN') === 'LINKEDIN';

  const dirty =
    (linkedIn && (name.trim() || null) !== (saved.name ?? null)) ||
    title.trim() !== saved.title ||
    (image?.key ?? null) !== (saved.image?.key ?? null) ||
    (linkedIn && (detailImage?.key ?? null) !== (saved.detailImage?.key ?? null)) ||
    (linkedIn && Number(connects) !== saved.connects) ||
    (price === '' ? null : Math.round(Number(price) * 100) / 100) !== saved.price;

  async function save() {
    setSaving(true);
    try {
      const r = await api<{ post: Post }>(`/api/admin/posts/${post.id}`, {
        method: 'PATCH',
        json: {
          title: title.trim(),
          image,
          ...(linkedIn ? { name: name.trim(), connects: Number(connects || 0), detailImage } : {}),
          ...(price !== '' ? { price: Number(price) } : {}),
        },
      });
      setSaved(r.post);
      setName(r.post.name ?? '');
      setTitle(r.post.title);
      setPrice(r.post.price !== null ? r.post.price.toFixed(2) : '');
      toast({ title: 'Saved', tone: 'success' });
    } catch (e) {
      toast({ title: e instanceof ApiError ? e.message : 'Could not save.', tone: 'error' });
    } finally {
      setSaving(false);
    }
  }

  async function accept() {
    setAccepting(true);
    try {
      const r = await api<{ post: Post }>(`/api/admin/posts/${post.id}/accept`, { method: 'POST', json: {} });
      toast({ title: 'Link accepted', body: 'It is now live in every customer feed.', tone: 'success' });
      onDone(r.post);
    } catch (e) {
      toast({ title: e instanceof ApiError ? e.message : 'Could not accept.', tone: 'error' });
      setAccepting(false);
    }
  }

  async function remove() {
    if (!window.confirm(`Delete the request "${post.name || post.title}"? This can't be undone.`)) return;
    setDeleting(true);
    try {
      await api(`/api/admin/posts/${post.id}`, { method: 'DELETE' });
      toast({ title: 'Request deleted', tone: 'success' });
      onDone();
    } catch (e) {
      toast({ title: e instanceof ApiError ? e.message : 'Could not delete.', tone: 'error' });
      setDeleting(false);
    }
  }

  const href = postHref(title);
  const sent = new Date(post.createdAt);

  return (
    <li className="overflow-hidden rounded-xl border border-line bg-bg-card shadow-soft">
      <div className="flex items-center justify-between gap-3 border-b border-line/70 bg-bg-elev/70 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <Avatar name={post.clientName} src={post.clientImage?.url} size={40} />
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-brand-mint">Seller</p>
            <p className="truncate text-base font-semibold leading-tight text-ink-hi">{post.clientName}</p>
            <p className="text-[11px] font-medium text-ink-mid">{ACCOUNT_KIND_LABEL[post.kind ?? 'LINKEDIN']}</p>
          </div>
        </div>
        <time dateTime={sent.toISOString()} className="shrink-0 text-right text-[11px] leading-tight tabular-nums text-ink-lo">
          <span className="block font-semibold text-ink-mid">{sent.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
          <span className="mt-0.5 block">{sent.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}</span>
        </time>
      </div>
      <div className="flex gap-4 px-4 py-4">
        <div className="shrink-0 pt-6">
          <ImageUpload value={image} onChange={setImage} placeholderSrc={kindLogoSrc(post.kind) ?? DEFAULT_ACCOUNT_IMAGE} imageOnly />
        </div>
        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <Label htmlFor={`t-${post.id}`}>Title</Label>
              {href && (
                <a href={href} target="_blank" rel="noopener noreferrer nofollow" className="text-xs text-brand-mint hover:underline">
                  Open link
                </a>
              )}
            </div>
            <Input id={`t-${post.id}`} maxLength={300} value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          {linkedIn && (
            <Field label="Name" htmlFor={`n-${post.id}`}>
              <Input id={`n-${post.id}`} maxLength={120} placeholder="Robert George" value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
          )}
          <div className={linkedIn ? 'grid grid-cols-2 gap-3' : undefined}>
            {linkedIn && (
              <Field label="Connects" htmlFor={`c-${post.id}`}>
                <Input id={`c-${post.id}`} type="number" min={0} step={1} value={connects} onChange={(e) => setConnects(e.target.value)} />
              </Field>
            )}
            <Field label="Price ($)" htmlFor={`p-${post.id}`}>
              <Input id={`p-${post.id}`} type="number" min={0} step="0.01" placeholder="50.00" value={price} onChange={(e) => setPrice(e.target.value)} />
            </Field>
          </div>
          {linkedIn && (
            <div>
              <Label>
                Detail image <span className="font-normal text-ink-lo">(optional)</span>
              </Label>
              <p className="mb-2 text-xs text-ink-lo">Buyers open it full size, with zoom.</p>
              <ImageUpload value={detailImage} onChange={setDetailImage} label="Add detail image" />
            </div>
          )}
        </div>
      </div>
      <div className="flex justify-end gap-2 border-t border-line/70 bg-bg-base/40 px-4 py-3">
        <Button variant="outline" size="icon" className="size-10" onClick={save} loading={saving} disabled={!dirty || !title.trim()} aria-label="Save" title="Save">
          {!saving && <Save />}
        </Button>
        <Button size="icon" className="size-10" onClick={accept} loading={accepting} disabled={dirty || saved.price === null} aria-label="Accept" title={saved.price === null ? 'Save a price first' : dirty ? 'Save your changes first' : 'Accept'}>
          {!accepting && <CheckCircle2 />}
        </Button>
        <Button variant="danger" size="icon" className="size-10" onClick={remove} loading={deleting} aria-label="Delete request" title="Delete request">
          {!deleting && <Trash2 />}
        </Button>
      </div>
    </li>
  );
}

function PostCover({ image, title, kind }: { image: ImageInfo | null; title: string; kind?: string | null }) {
  if (image?.url) return <PostImage image={image} title={title} />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={coverSrc(null, kind)} alt={title} className={coverClass(null, kind)} />;
}

function acceptedStamp(post: Post) {
  const d = new Date(post.updatedAt);
  return {
    iso: d.toISOString(),
    time: d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
    date: d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }),
  };
}

function AcceptedRow({ post }: { post: Post }) {
  const when = acceptedStamp(post);
  const name = post.name?.trim();
  const href = postHref(post.title);
  const linkCls = 'block truncate text-xs text-brand-mint hover:underline';
  const link = href ? (
    <a href={href} target="_blank" rel="noopener noreferrer nofollow" className={linkCls} title={post.title}>
      {post.title}
    </a>
  ) : (
    <p className="truncate text-xs text-ink-mid">{post.title}</p>
  );

  return (
    <li className="px-3.5 py-3">
      <time dateTime={when.iso} className="mb-2 block text-right text-[11px] leading-none tabular-nums text-ink-lo">
        <span className="font-semibold text-ink-mid">{when.time}</span>
        <span className="px-1 text-line">·</span>
        {when.date}
      </time>
      <div className="flex items-center gap-2.5">
        <div className="size-11 shrink-0 overflow-hidden rounded-lg bg-bg-elev ring-1 ring-line/70">
          <PostCover image={post.image} title={post.title} kind={post.kind} />
        </div>
        <div className="min-w-0 flex-1">
          {name ? (
            <>
              <p className="truncate text-sm font-semibold leading-5 text-ink-hi">{name}</p>
              <div className="mt-0.5">{link}</div>
            </>
          ) : href ? (
            <a href={href} target="_blank" rel="noopener noreferrer nofollow" className="block truncate text-sm font-semibold leading-5 text-ink-hi hover:text-brand-mint hover:underline" title={post.title}>
              {post.title}
            </a>
          ) : (
            <p className="truncate text-sm font-semibold leading-5 text-ink-hi">{post.title}</p>
          )}
        </div>
      </div>
      <div className="mt-2.5 flex items-center justify-between gap-3 border-t border-line/60 pt-2">
        {(post.kind ?? 'LINKEDIN') === 'LINKEDIN' ? (
          <p className="text-xs text-ink-lo">
            Connects <span className="font-semibold tabular-nums text-ink-hi">{post.connects}</span>
          </p>
        ) : (
          <p className="text-xs font-medium text-ink-mid">{ACCOUNT_KIND_LABEL[post.kind]}</p>
        )}
        <p className="text-sm font-bold tabular-nums text-ink-hi">{formatPrice(post.price)}</p>
      </div>
    </li>
  );
}
