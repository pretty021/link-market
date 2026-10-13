'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { FilePlus2, LifeBuoy, Link2, MessageSquare, Plus, Trash2, Users } from 'lucide-react';
import { AccountTable, AccountViewToggle, useAccountView } from '@/components/account-view';
import { ListToolbar, STAFF_STATUS_OPTIONS, useListControls } from '@/components/list-toolbar';
import { Countdown, PostImage, PostTitle, StatusBadge } from '@/components/post-bits';
import { useOnReconnect, useSocketEvent } from '@/components/providers/realtime';
import { useMe } from '@/components/providers/session';
import { useToast } from '@/components/providers/toast';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Avatar, Badge, Card, CardHeader, Empty, Field, Input, Spinner } from '@/components/ui/primitives';
import { api, ApiError } from '@/lib/client/api';
import type { ImageInfo, Post } from '@/lib/client/types';
import { kindHref } from '@/lib/account-kinds';
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
  const router = useRouter();
  const { me } = useMe();
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [online, setOnline] = useState<OnlineCustomer[] | null>(null);
  const [chats, setChats] = useState<ChatRow[] | null>(null);
  const [requestOpen, setRequestOpen] = useState(false);
  const list = useListControls('client-posts', STAFF_STATUS_OPTIONS, 'updated', ['all', 'title', 'buyer']);
  const [layout, setLayout] = useAccountView();
  const linkedIn = posts === null ? null : posts.filter((p) => (p.kind ?? 'LINKEDIN') === 'LINKEDIN');
  const view = list.apply(linkedIn);

  useEffect(() => {
    if (me.kind === 'user' && me.role === 'CLIENT' && me.sellerKinds && !me.sellerKinds.includes('LINKEDIN') && me.sellerKinds[0]) {
      router.replace(kindHref(me.sellerKinds[0], 'client'));
    }
  }, [me, router]);

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

  const sellsLinkedIn = !(me.kind === 'user' && me.role === 'CLIENT' && me.sellerKinds && !me.sellerKinds.includes('LINKEDIN'));
  if (!sellsLinkedIn) return null;

  return (
    <>
      <div className="mb-6 flex flex-wrap justify-end gap-2">
        <Button variant="purple" onClick={openSupport}><LifeBuoy /> Admin chat</Button>
        <Button onClick={() => setRequestOpen(true)}><FilePlus2 /> Link Request</Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <Card>
          <CardHeader
            title="My Links"
            subtitle="Live after admin approval."
            icon={<Link2 className="size-5" />}
            action={linkedIn && linkedIn.length > 0 ? <AccountViewToggle value={layout} onChange={setLayout} /> : undefined}
          />
          {posts === null ? (
            <div className="flex justify-center py-12"><Spinner /></div>
          ) : linkedIn!.length === 0 ? (
            <Empty title="No links yet" hint="Tap Link Request to add one." />
          ) : (
            <>
              <div className="border-b border-line/60 px-4 py-4">
                <ListToolbar controls={list} counts={view.counts} shown={view.shown?.length ?? 0} total={view.total} />
              </div>
              {view.shown!.length === 0 ? (
                <Empty title="No links match" hint="Try other filters." />
              ) : layout === 'table' ? (
                <AccountTable posts={view.shown!} showConnects flash={flash} onExpired={() => void loadPosts()} />
              ) : (
              <ul className="grid gap-3 bg-bg-base/70 p-4 sm:grid-cols-2 lg:grid-cols-4">
                  {view.shown!.map((p) => (
                    <LinkItem key={p.id} post={p} flash={flash.has(p.id)} onExpired={() => void loadPosts()} />
                  ))}
                </ul>
              )}
            </>
          )}
        </Card>

        <div className="space-y-6">
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

function LinkItem({ post, flash, onExpired }: { post: Post; flash: boolean; onExpired: () => void }) {
  const when = new Date(post.updatedAt);
  return (
    <li
      className={cn(
        'overflow-hidden rounded-xl border border-line bg-bg-card shadow-soft transition-colors duration-700',
        post.status === 'COMPLETED' && 'border-state-ok/40 bg-state-ok/15',
        flash && 'ring-2 ring-inset ring-brand-mint/50',
      )}
    >
      <div className={cn('flex items-center justify-between gap-2 px-3 py-2', post.status === 'COMPLETED' ? 'bg-state-ok/20' : 'bg-bg-elev/70')}>
        <div className="flex min-w-0 flex-wrap items-center gap-1">
          <StatusBadge status={post.status} clientChecking={!!post.progressingPausedAt} />
          {post.approval ? <Badge tone="mint">Accepted</Badge> : <Badge tone="amber">Awaiting admin</Badge>}
        </div>
        <time dateTime={when.toISOString()} className="shrink-0 text-right text-[10px] leading-tight tabular-nums text-ink-lo">
          <span className="block font-semibold text-ink-mid">{when.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
          <span className="block">{when.toLocaleDateString([], { month: 'short', day: 'numeric' })}</span>
        </time>
      </div>
      <div className="flex items-start gap-2 p-3">
        <div className="size-8 shrink-0 overflow-hidden rounded-md bg-bg-elev">
          {post.image?.url ? (
            <PostImage image={post.image} title={post.title} />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src="/post-default.jpg" alt="" className="size-full object-cover" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <PostTitle post={post} className="min-w-0" headingClassName="text-sm font-semibold" />
          <p className="mt-1 text-sm font-bold tabular-nums">{formatPrice(post.price)}</p>
          <p className="mt-1 text-[11px] text-ink-mid">{post.connects} connects · {post.viewCount} views</p>
          {post.status === 'PROGRESSING' && (
            <div className="mt-1">
              <Countdown expiresAt={post.progressingExpiresAt} paused={!!post.progressingPausedAt} onDone={onExpired} />
            </div>
          )}
        </div>
      </div>
    </li>
  );
}

type RequestDraft = { id: number; title: string; name: string; connects: string; price: string };

function blankRequest(): RequestDraft {
  return { id: Date.now() + Math.floor(Math.random() * 1000), title: '', name: '', connects: '', price: '' };
}

function PostRequestDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (p: Post[]) => void }) {
  const toast = useToast();
  const [rows, setRows] = useState<RequestDraft[]>([blankRequest()]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setRows([blankRequest()]);
      setError(null);
    }
  }, [open]);

  function patch(id: number, key: keyof Omit<RequestDraft, 'id'>, value: string) {
    setRows((list) => list.map((row) => (row.id === id ? { ...row, [key]: value } : row)));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const filled = rows.filter((row) => row.title.trim() || row.name.trim() || row.connects.trim() || row.price.trim());
    if (filled.length === 0) return setError('Add at least one link.');
    if (filled.some((row) => !row.title.trim() || !row.name.trim() || row.connects.trim() === '' || row.price.trim() === '')) {
      return setError('Each link needs a link, name, connects, and price.');
    }
    setBusy(true);
    setError(null);
    try {
      const posts = filled.map((row) => ({
        kind: 'LINKEDIN' as const,
        title: row.title.trim(),
        name: row.name.trim(),
        connects: Number(row.connects),
        price: Number(row.price),
      }));
      const r = await api<{ posts: Post[] }>('/api/client/posts', { json: { posts } });
      onCreated(r.posts);
      toast({ title: `${r.posts.length} link${r.posts.length === 1 ? '' : 's'} requested`, body: 'The admin will review them shortly.', tone: 'success' });
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not submit.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="Link Request" description="Name, connects, and price for each link." className="max-w-xl">
        <form onSubmit={submit} className="space-y-3">
          {rows.map((row, i) => (
            <div key={row.id} className="rounded-xl border border-line bg-bg-base/40 p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-ink-mid">Link {i + 1}</p>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8 text-state-err"
                  aria-label="Remove link"
                  disabled={rows.length === 1}
                  onClick={() => setRows(rows.filter((x) => x.id !== row.id))}
                >
                  <Trash2 />
                </Button>
              </div>
              <div className="space-y-3">
                <Field label="Link" htmlFor={`req-title-${row.id}`}>
                  <Input
                    id={`req-title-${row.id}`}
                    autoFocus={i === rows.length - 1}
                    placeholder="http://linkedin.com/in/usernames"
                    maxLength={300}
                    required
                    value={row.title}
                    onChange={(e) => patch(row.id, 'title', e.target.value)}
                  />
                </Field>
                <Field label="Name" htmlFor={`req-name-${row.id}`}>
                  <Input
                    id={`req-name-${row.id}`}
                    placeholder="Robert George"
                    maxLength={120}
                    required
                    value={row.name}
                    onChange={(e) => patch(row.id, 'name', e.target.value)}
                  />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Connects" htmlFor={`req-connects-${row.id}`}>
                    <Input
                      id={`req-connects-${row.id}`}
                      type="number"
                      min={0}
                      step={1}
                      required
                      value={row.connects}
                      onChange={(e) => patch(row.id, 'connects', e.target.value)}
                    />
                  </Field>
                  <Field label="Price ($)" htmlFor={`req-price-${row.id}`}>
                    <Input
                      id={`req-price-${row.id}`}
                      type="number"
                      min={0}
                      step="0.01"
                      placeholder="50.00"
                      required
                      value={row.price}
                      onChange={(e) => patch(row.id, 'price', e.target.value)}
                    />
                  </Field>
                </div>
              </div>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" disabled={rows.length >= 50} onClick={() => setRows([...rows, blankRequest()])}>
            <Plus /> Add link
          </Button>
          {error && <p className="text-sm text-state-err">{error}</p>}
          <Button type="submit" className="w-full" loading={busy}>Submit</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
