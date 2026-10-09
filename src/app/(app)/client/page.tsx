'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { CalendarCheck, FilePlus2, LifeBuoy, Link2, MessageSquare, Plus, Trash2, Users } from 'lucide-react';
import { PageTitle } from '@/components/app-shell';
import { ListToolbar, STAFF_STATUS_OPTIONS, ToolbarPanelTitle, useListControls } from '@/components/list-toolbar';
import { Countdown, PostImage, PostTitle, StatusBadge, postLabel } from '@/components/post-bits';
import { useOnReconnect, useSocketEvent } from '@/components/providers/realtime';
import { useMe } from '@/components/providers/session';
import { useToast } from '@/components/providers/toast';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Avatar, Badge, Card, CardHeader, Empty, Input, Spinner } from '@/components/ui/primitives';
import { api, ApiError } from '@/lib/client/api';
import type { ImageInfo, Post } from '@/lib/client/types';
import { cn, formatPrice, timeAgo } from '@/lib/utils';

type OnlineCustomer = { id: string; name: string; image: ImageInfo | null };
type ChatRow = {
  conversationId: string;
  lastMessageAt: string | null;
  unread: number;
  post: { id: string; title: string; status: string } | null;
  customer: { id: string; name: string; image: ImageInfo | null; online: boolean } | null;
};

export default function ClientDashboard() {
  const { me } = useMe();
  const router = useRouter();
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [online, setOnline] = useState<OnlineCustomer[] | null>(null);
  const [chats, setChats] = useState<ChatRow[] | null>(null);
  const [requestOpen, setRequestOpen] = useState(false);
  const list = useListControls('client-posts', STAFF_STATUS_OPTIONS, 'updated', ['all', 'title', 'buyer']);
  const view = list.apply(posts);

  const loadPosts = useCallback(
    async () => setPosts([...(await api<{ posts: Post[] }>('/api/client/posts')).posts].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))),
    [],
  );
  const loadOnline = useCallback(async () => setOnline((await api<{ customers: OnlineCustomer[] }>('/api/client/customers/online')).customers), []);
  const loadChats = useCallback(async () => setChats((await api<{ chats: ChatRow[] }>('/api/client/customers/by-chat')).chats), []);

  useEffect(() => {
    void loadPosts();
    void loadOnline();
    void loadChats();
  }, [loadPosts, loadOnline, loadChats]);
  useOnReconnect(() => {
    void loadPosts();
    void loadOnline();
    void loadChats();
  });

  // Presence windows are 60s, so also refresh periodically to drop users whose heartbeat stopped.
  useEffect(() => {
    const id = setInterval(() => void loadOnline(), 30_000);
    return () => clearInterval(id);
  }, [loadOnline]);

  const [flash, setFlash] = useState<Set<string>>(new Set());

  // Newest status change first. updatedAt moves on every status transition (set from the DB clock).
  const sorted = (list: Post[]) => [...list].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  const postsRef = useRef(posts);
  postsRef.current = posts;

  const upsert = (p: Post) => {
    const old = postsRef.current?.find((x) => x.id === p.id);
    if (!old || old.status !== p.status) {
      setFlash((f) => new Set(f).add(p.id));
      setTimeout(() => setFlash((f) => {
        const n = new Set(f);
        n.delete(p.id);
        return n;
      }), 3000);
    }
    setPosts((prev) => (prev ? sorted(prev.some((x) => x.id === p.id) ? prev.map((x) => (x.id === p.id ? p : x)) : [p, ...prev]) : prev));
  };

  useSocketEvent<{ post: Post }>('post:updated', ({ post }) => upsert(post));
  useSocketEvent<{ post: Post }>('post:published', ({ post }) => upsert(post));
  useSocketEvent<{ post: Post }>('post:expired', ({ post }) => {
    upsert(post);
    void loadPosts();
  });
  useSocketEvent<{ posts: Post[] }>('post:requested', ({ posts: created }) => created.forEach(upsert));
  useSocketEvent<{ postId: string }>('post:deleted', ({ postId }) => setPosts((prev) => prev?.filter((p) => p.id !== postId) ?? prev));
  useSocketEvent('presence:update', () => void loadOnline());
  useSocketEvent('conversation:updated', () => void loadChats());
  useSocketEvent('notification:new', () => void loadChats());

  async function openSupport() {
    const r = await api<{ conversationId: string }>('/api/conversations/support', { method: 'POST' });
    router.push(`/chat?c=${r.conversationId}`);
  }

  return (
    <>
      <PageTitle
        title={`Hello, ${me.kind === 'user' ? me.name : ''}`}
        subtitle={me.kind === 'user' ? `s_counts: ${me.s_counts ?? 0}` : undefined}
        action={
          <div className="flex gap-2">
            <Button variant="purple" onClick={openSupport}><LifeBuoy /> Admin chat</Button>
            <Button onClick={() => setRequestOpen(true)}><FilePlus2 /> Post Request</Button>
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <Card>
          <CardHeader title="My Accounts" subtitle="Live after admin approval." icon={<Link2 className="size-5" />} />
          {posts === null ? (
            <div className="flex justify-center py-12"><Spinner /></div>
          ) : posts.length === 0 ? (
            <Empty title="No posts yet" hint="Tap Post Request to add one." />
          ) : view.shown!.length === 0 ? (
            <Empty title="No posts match" hint="Try other filters." />
          ) : (
            <ul className="divide-y divide-line/50">
              {view.shown!.map((p) => (
                <li
                  key={p.id}
                  className={cn(
                    'flex gap-4 p-4 transition-colors duration-700',
                    p.status === 'COMPLETED' && 'border-l-4 border-l-state-err/60 bg-state-err/[0.06] pl-3',
                    flash.has(p.id) && 'bg-brand-mint/10 ring-1 ring-inset ring-brand-mint/50',
                  )}
                >
                  <div className="h-20 w-28 shrink-0 overflow-hidden rounded-xl">
                    <PostImage image={p.image} title={p.title} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <PostTitle post={p} className="flex-1" />
                      <span className="font-bold">{formatPrice(p.price)}</span>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-ink-mid">
                      <StatusBadge status={p.status} clientChecking={!!p.progressingPausedAt} />
                      {p.approval ? (
                        <Badge tone="mint">Accepted</Badge>
                      ) : (
                        <Badge tone="amber">Awaiting admin</Badge>
                      )}
                      {p.approval && !p.visible && <Badge tone="slate">Hidden</Badge>}
                      <span>{p.connects} connects</span>
                      <span>· {p.viewCount} views</span>
                      {p.status === 'PROGRESSING' && (
                        <>
                          <span>· Held by {p.holderName}</span>
                          <Countdown expiresAt={p.progressingExpiresAt} paused={!!p.progressingPausedAt} onDone={() => void loadPosts()} />
                        </>
                      )}
                      {p.status === 'COMPLETED' && p.holderName && <span>· Completed with {p.holderName}</span>}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="space-y-6">
          {posts && <TodaySales posts={posts} />}

          {posts && posts.length > 0 && (
            <Card>
              <CardHeader title={<ToolbarPanelTitle />} subtitle="Find accounts fast" />
              <ListToolbar controls={list} counts={view.counts} shown={view.shown?.length ?? 0} total={view.total} layout="stack" className="p-5" />
            </Card>
          )}

          <Card>
            <CardHeader title="Customers by chat" subtitle="Latest first" icon={<MessageSquare className="size-5" />} />
            {chats === null ? (
              <div className="flex justify-center py-8"><Spinner /></div>
            ) : chats.length === 0 ? (
              <Empty title="No deal chats yet" />
            ) : (
              <ul className="max-h-[360px] divide-y divide-line/50 overflow-y-auto">
                {chats.map((c) => (
                  <li key={c.conversationId}>
                    <button onClick={() => router.push(`/chat?c=${c.conversationId}`)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-bg-elev/60">
                      <Avatar name={c.customer?.name} src={c.customer?.image?.url} online={c.customer?.online} size={36} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{c.customer?.name ?? 'Customer'}</p>
                        <p className="truncate text-xs text-ink-lo">{c.post?.title} · {timeAgo(c.lastMessageAt)}</p>
                      </div>
                      {c.unread > 0 && (
                        <span className="flex min-w-[20px] items-center justify-center rounded-full bg-brand-mint px-1.5 text-[11px] font-bold text-on-mint">{c.unread}</span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader title="Online customers" subtitle={online ? `${online.length} online now` : ' '} icon={<Users className="size-5" />} />
            {online === null ? (
              <div className="flex justify-center py-8"><Spinner /></div>
            ) : online.length === 0 ? (
              <Empty title="Nobody online right now" />
            ) : (
              <ul className="flex max-h-[300px] flex-wrap gap-3 overflow-y-auto p-4">
                {online.map((c) => (
                  <li key={c.id} className="flex items-center gap-2 rounded-full border border-line bg-bg-base/60 py-1 pl-1 pr-3">
                    <Avatar name={c.name} src={c.image?.url} online size={26} />
                    <span className="text-xs font-medium">{c.name}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

        </div>
      </div>

      <PostRequestDialog open={requestOpen} onClose={() => setRequestOpen(false)} onCreated={(created) => created.forEach(upsert)} />
    </>
  );
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Today's completed sales for this Client (since local midnight), plus all-time totals. Live with the post list. */
function TodaySales({ posts }: { posts: Post[] }) {
  // Re-render at local midnight so "today" rolls over without a refresh.
  const [dayStart, setDayStart] = useState(() => new Date().setHours(0, 0, 0, 0));
  useEffect(() => {
    const next = new Date(dayStart).setDate(new Date(dayStart).getDate() + 1);
    const t = setTimeout(() => setDayStart(new Date().setHours(0, 0, 0, 0)), Math.max(1000, next - Date.now()));
    return () => clearTimeout(t);
  }, [dayStart]);

  const completed = posts.filter((p) => p.status === 'COMPLETED' && p.completedAt);
  const today = completed.filter((p) => new Date(p.completedAt!).getTime() >= dayStart);
  const todayTotal = round2(today.reduce((s, p) => s + (p.price ?? 0), 0));
  const allTotal = round2(completed.reduce((s, p) => s + (p.price ?? 0), 0));
  const dateLabel = new Date(dayStart).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

  return (
    <Card>
      <CardHeader title="Today" subtitle={`Sales · ${dateLabel}`} icon={<CalendarCheck className="size-5" />} />
      <div className="grid grid-cols-2 divide-x divide-line">
        <div className="p-5">
          <p className="text-xs font-medium text-ink-lo">Total price</p>
          <p className="mt-1 text-2xl font-bold tabular-nums tracking-tight text-brand-mint">{formatPrice(todayTotal)}</p>
        </div>
        <div className="p-5">
          <p className="text-xs font-medium text-ink-lo">Completed</p>
          <p className="mt-1 text-2xl font-bold tabular-nums tracking-tight">{today.length}</p>
        </div>
      </div>
      {today.length > 0 && (
        <ul className="max-h-40 space-y-1.5 overflow-y-auto border-t border-line px-5 py-3 text-xs">
          {today.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-3">
              <span className="truncate text-ink-mid">{postLabel(p)}</span>
              <span className="shrink-0 font-semibold tabular-nums">{formatPrice(p.price)}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-center justify-between border-t border-line px-5 py-3 text-xs text-ink-lo">
        <span>All time</span>
        <span className="tabular-nums">
          {completed.length} completed · <span className="font-semibold text-ink-mid">{formatPrice(allTotal)}</span>
        </span>
      </div>
    </Card>
  );
}

function PostRequestDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (p: Post[]) => void }) {
  const toast = useToast();
  const [lines, setLines] = useState<{ id: number; value: string }[]>([{ id: 1, value: '' }]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setLines([{ id: Date.now(), value: '' }]);
      setError(null);
    }
  }, [open]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const titles = lines.map((l) => l.value.trim()).filter(Boolean);
    if (titles.length === 0) return setError('Add at least one line.');
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ posts: Post[] }>('/api/client/posts', { json: { titles } });
      onCreated(r.posts);
      toast({ title: `${r.posts.length} post${r.posts.length === 1 ? '' : 's'} requested`, body: 'The admin will review them shortly.', tone: 'success' });
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not submit.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="Post Request" description="One line per account.">
        <form onSubmit={submit} className="space-y-3">
          {lines.map((l, i) => (
            <div key={l.id} className="flex gap-2">
              <Input
                autoFocus={i === lines.length - 1}
                placeholder={`e.g. Account #${1045 + i}`}
                maxLength={300}
                value={l.value}
                onChange={(e) => setLines(lines.map((x) => (x.id === l.id ? { ...x, value: e.target.value } : x)))}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-10 shrink-0"
                aria-label="Remove line"
                disabled={lines.length === 1}
                onClick={() => setLines(lines.filter((x) => x.id !== l.id))}
              >
                <Trash2 />
              </Button>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" disabled={lines.length >= 50} onClick={() => setLines([...lines, { id: Date.now(), value: '' }])}>
            <Plus /> Add line
          </Button>
          {error && <p className="text-sm text-state-err">{error}</p>}
          <Button type="submit" className="w-full" loading={busy}>Submit</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
