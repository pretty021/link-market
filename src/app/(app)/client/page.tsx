'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { FilePlus2, LifeBuoy, Link2, MessageSquare, Plus, Trash2, Users } from 'lucide-react';
import { ListToolbar, STAFF_STATUS_OPTIONS, useListControls } from '@/components/list-toolbar';
import { Countdown, PostImage, PostTitle, StatusBadge } from '@/components/post-bits';
import { useOnReconnect, useSocketEvent } from '@/components/providers/realtime';
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
      <div className="mb-6 flex flex-wrap justify-end gap-2">
        <Button variant="purple" onClick={openSupport}><LifeBuoy /> Admin chat</Button>
        <Button onClick={() => setRequestOpen(true)}><FilePlus2 /> Link Request</Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <Card>
          <CardHeader title="My Links" subtitle="Live after admin approval." icon={<Link2 className="size-5" />} />
          {posts === null ? (
            <div className="flex justify-center py-12"><Spinner /></div>
          ) : posts.length === 0 ? (
            <Empty title="No links yet" hint="Tap Link Request to add one." />
          ) : (
            <>
              <div className="border-b border-line/60 px-4 py-4">
                <ListToolbar controls={list} counts={view.counts} shown={view.shown?.length ?? 0} total={view.total} />
              </div>
              {view.shown!.length === 0 ? (
                <Empty title="No links match" hint="Try other filters." />
              ) : (
                <ul className="space-y-3 bg-bg-base/70 p-4">
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
      <div className={cn('flex items-center justify-between gap-3 px-4 py-2.5', post.status === 'COMPLETED' ? 'bg-state-ok/20' : 'bg-bg-elev/70')}>
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <StatusBadge status={post.status} clientChecking={!!post.progressingPausedAt} />
          {post.approval ? <Badge tone="mint">Accepted</Badge> : <Badge tone="amber">Awaiting admin</Badge>}
          {post.approval && !post.visible && <Badge tone="slate">Hidden</Badge>}
        </div>
        <time dateTime={when.toISOString()} className="shrink-0 text-right text-[11px] leading-tight tabular-nums text-ink-lo">
          <span className="block text-[10px] font-semibold uppercase tracking-[0.12em]">Updated</span>
          <span className="mt-0.5 block font-semibold text-ink-mid">{when.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
          <span className="block">{when.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}</span>
        </time>
      </div>
      <div className="flex gap-4 p-4">
        <div className="h-20 w-28 shrink-0 overflow-hidden rounded-xl bg-bg-elev">
          {post.image?.url ? (
            <PostImage image={post.image} title={post.title} />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src="/post-default.jpg" alt={post.title} className="size-full object-cover" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <PostTitle post={post} className="min-w-0 flex-1" />
            <span className="shrink-0 text-base font-bold tabular-nums">{formatPrice(post.price)}</span>
          </div>
          <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-mid">
            <span>{post.connects} connects</span>
            <span className="text-line">·</span>
            <span>{post.viewCount} views</span>
            {post.status === 'PROGRESSING' && (
              <>
                <span className="text-line">·</span>
                <span>Held by {post.holderName}</span>
                <Countdown expiresAt={post.progressingExpiresAt} paused={!!post.progressingPausedAt} onDone={onExpired} />
              </>
            )}
            {post.status === 'COMPLETED' && post.holderName && (
              <>
                <span className="text-line">·</span>
                <span>Completed with {post.holderName}</span>
              </>
            )}
          </p>
        </div>
      </div>
    </li>
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
      <DialogContent title="Link Request" description="One line per link.">
        <form onSubmit={submit} className="space-y-3">
          {lines.map((l, i) => (
            <div key={l.id} className="flex gap-2">
              <Input
                autoFocus={i === lines.length - 1}
                placeholder={'http://linkedin.com/in/usernames'}
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
