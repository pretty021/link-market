'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { Eye, FilePlus2, Plus, Trash2 } from 'lucide-react';
import { PageTitle } from '@/components/app-shell';
import { Chip, LinkedInCard, StatusDot, usesAccountCard } from '@/components/linkedin-card';
import { ListToolbar, STAFF_STATUS_OPTIONS, useListControls } from '@/components/list-toolbar';
import { Countdown, PostImage, PostTitle, StatusBadge } from '@/components/post-bits';
import { useOnReconnect, useSocketEvent } from '@/components/providers/realtime';
import { useMe } from '@/components/providers/session';
import { useToast } from '@/components/providers/toast';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Badge, Card, CardHeader, Empty, Field, Input, Spinner } from '@/components/ui/primitives';
import { AccountTable, AccountViewToggle, useAccountView } from '@/components/account-view';
import { ACCOUNT_KIND_LABEL, coverClass, coverSrc, type AccountKind } from '@/lib/account-kinds';
import { api, ApiError } from '@/lib/client/api';
import type { Post } from '@/lib/client/types';
import { homePath } from '@/lib/home';
import { cn, formatPrice } from '@/lib/utils';

export function SellerKindPage({ kind }: { kind: AccountKind }) {
  const { me } = useMe();
  const router = useRouter();
  const label = ACCOUNT_KIND_LABEL[kind];
  const allowed = me.kind === 'user' && me.role === 'CLIENT' && (me.sellerKinds ?? ['LINKEDIN']).includes(kind);
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [requestOpen, setRequestOpen] = useState(false);
  const [flash, setFlash] = useState<Set<string>>(new Set());
  const [layout, setLayout] = useAccountView();
  // GV and Gmail seller pages offer fewer sorts.
  const list = useListControls(
    `client-${kind.toLowerCase()}`,
    STAFF_STATUS_OPTIONS,
    'updated',
    ['all', 'title', 'buyer'],
    true,
    kind === 'GV' ? ['New', 'Updated', 'Price', '0–9'] : kind === 'GMAIL' ? ['New', 'Updated', 'Price', 'A–Z'] : undefined,
  );
  const view = list.apply(posts);

  useEffect(() => {
    if (me.kind === 'user' && me.role === 'CLIENT' && me.sellerKinds && !me.sellerKinds.includes(kind)) {
      router.replace(homePath(me));
    }
  }, [me, kind, router]);

  const loadPosts = useCallback(async () => {
    const next = (await api<{ posts: Post[] }>(`/api/client/posts?kind=${kind}`)).posts;
    setPosts([...next].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
  }, [kind]);

  useEffect(() => {
    if (allowed) void loadPosts();
  }, [allowed, loadPosts]);
  useOnReconnect(() => {
    if (allowed) void loadPosts();
  });

  const upsert = (p: Post) => {
    if (p.clientId !== me.id || (p.kind ?? 'LINKEDIN') !== kind) return; // only this seller's own links
    setPosts((prev) => {
      if (!prev) return prev;
      const rest = prev.filter((x) => x.id !== p.id);
      return [p, ...rest].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    });
    setFlash((prev) => new Set(prev).add(p.id));
    window.setTimeout(() => setFlash((prev) => {
      const next = new Set(prev);
      next.delete(p.id);
      return next;
    }), 1600);
  };

  useSocketEvent<{ post: Post }>('post:updated', ({ post }) => upsert(post));
  useSocketEvent<{ post: Post }>('post:published', ({ post }) => upsert(post));
  useSocketEvent<{ post: Post }>('post:expired', ({ post }) => {
    upsert(post);
    void loadPosts();
  });
  useSocketEvent<{ posts: Post[] }>('post:requested', ({ posts: created }) => created.forEach(upsert));
  useSocketEvent<{ postId: string }>('post:deleted', ({ postId }) => setPosts((prev) => prev?.filter((p) => p.id !== postId) ?? prev));

  if (!allowed) return null;

  return (
    <>
      <PageTitle title={`${label} accounts`} subtitle="Live after admin approval." />
      <div className="mb-6 flex justify-end">
        <Button onClick={() => setRequestOpen(true)}><FilePlus2 /> {label} request</Button>
      </div>
      <Card>
        <CardHeader
          title={`My ${label} accounts`}
          subtitle="Title and price only."
          action={posts && posts.length > 0 ? <AccountViewToggle value={layout} onChange={setLayout} /> : undefined}
        />
        {posts === null ? (
          <div className="flex justify-center py-12"><Spinner /></div>
        ) : posts.length === 0 ? (
          <Empty title={`No ${label} accounts yet`} hint={`Tap ${label} request to add one.`} />
        ) : (
          <>
            <div className="border-b border-line/60 px-4 py-4">
              <ListToolbar controls={list} counts={view.counts} shown={view.shown?.length ?? 0} total={view.total} />
            </div>
            {view.shown!.length === 0 ? (
              <Empty title="No accounts match" hint="Try other filters." />
            ) : layout === 'table' ? (
              <AccountTable posts={view.shown!} showConnects={false} flash={flash} onExpired={() => void loadPosts()} />
            ) : (
              <ul className={cn('grid grid-cols-1 bg-bg-base/70 p-3 sm:p-4', usesAccountCard(kind) ? 'gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-3' : 'gap-3 sm:grid-cols-2 lg:grid-cols-4')}>
                {view.shown!.map((p) =>
                  usesAccountCard(kind) ? (
                    <AccountCardItem key={p.id} post={p} flash={flash.has(p.id)} onExpired={() => void loadPosts()} />
                  ) : (
                    <AccountItem key={p.id} post={p} flash={flash.has(p.id)} onExpired={() => void loadPosts()} />
                  ),
                )}
              </ul>
            )}
          </>
        )}
      </Card>
      <SimpleRequestDialog kind={kind} open={requestOpen} onClose={() => setRequestOpen(false)} onCreated={(created) => created.forEach(upsert)} />
    </>
  );
}

/** GV / Gmail: the same account card as the seller's LinkedIn links. */
function AccountCardItem({ post, flash, onExpired }: { post: Post; flash: boolean; onExpired: () => void }) {
  const done = post.status === 'COMPLETED';
  return (
    <li>
      <LinkedInCard
        post={post}
        className={cn('h-full transition-colors duration-700', done && 'border-state-ok/40 bg-state-ok/15', flash && 'ring-2 ring-inset ring-brand-mint/50')}
        headerClassName={done ? 'bg-state-ok/20' : undefined}
        badges={
          <>
            <StatusBadge status={post.status} clientChecking={!!post.progressingPausedAt} />
            {post.approval && !post.visible && <Badge tone="slate">Hidden</Badge>}
          </>
        }
        chips={<Chip icon={<Eye />}>{post.viewCount} views</Chip>}
        person={post.holderName ? { name: post.holderName, image: null, label: done ? 'Bought by' : 'Buyer' } : null}
        personStatus={
          done ? (
            <StatusDot tone="ok">Sold</StatusDot>
          ) : post.status === 'PROGRESSING' ? (
            <StatusDot tone="purple">In progress</StatusDot>
          ) : post.status === 'REQUESTED' ? (
            <StatusDot tone="amber">Awaiting admin</StatusDot>
          ) : !post.visible ? (
            <StatusDot tone="lo">Hidden</StatusDot>
          ) : (
            <StatusDot tone="ok">Available</StatusDot>
          )
        }
        action={
          post.status === 'PROGRESSING' ? (
            <Countdown expiresAt={post.progressingExpiresAt} paused={!!post.progressingPausedAt} onDone={onExpired} />
          ) : undefined
        }
      />
    </li>
  );
}

function AccountItem({ post, flash, onExpired }: { post: Post; flash: boolean; onExpired: () => void }) {
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
            <img src={coverSrc(null, post.kind)} alt="" className={coverClass(null, post.kind, 'p-0.5')} />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <PostTitle post={post} className="min-w-0" headingClassName="text-sm font-semibold" />
          <p className="mt-1 text-sm font-bold tabular-nums">{formatPrice(post.price)}</p>
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

type Draft = { id: number; title: string; price: string };

function blank(): Draft {
  return { id: Date.now() + Math.floor(Math.random() * 1000), title: '', price: '' };
}

function SimpleRequestDialog({
  kind,
  open,
  onClose,
  onCreated,
}: {
  kind: AccountKind;
  open: boolean;
  onClose: () => void;
  onCreated: (posts: Post[]) => void;
}) {
  const toast = useToast();
  const label = ACCOUNT_KIND_LABEL[kind];
  const [rows, setRows] = useState<Draft[]>([blank()]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setRows([blank()]);
      setError(null);
    }
  }, [open]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const filled = rows.filter((row) => row.title.trim() || row.price.trim());
    if (filled.length === 0) return setError('Add at least one account.');
    if (filled.some((row) => !row.title.trim() || row.price.trim() === '')) {
      return setError('Each account needs a title and a price.');
    }
    setBusy(true);
    setError(null);
    try {
      const posts = filled.map((row) => ({ kind, title: row.title.trim(), price: Number(row.price) }));
      const r = await api<{ posts: Post[] }>('/api/client/posts', { json: { posts } });
      onCreated(r.posts);
      toast({ title: `${r.posts.length} ${label} account${r.posts.length === 1 ? '' : 's'} requested`, body: 'The admin will review them shortly.', tone: 'success' });
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not submit.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={`${label} request`} description="Title and price for each account." className="max-w-xl">
        <form onSubmit={submit} className="space-y-3">
          {rows.map((row, i) => (
            <div key={row.id} className="rounded-xl border border-line bg-bg-base/40 p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-ink-mid">Account {i + 1}</p>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8 text-state-err"
                  aria-label="Remove account"
                  disabled={rows.length === 1}
                  onClick={() => setRows(rows.filter((x) => x.id !== row.id))}
                >
                  <Trash2 />
                </Button>
              </div>
              <div className="space-y-3">
                <Field label="Title" htmlFor={`simple-title-${row.id}`}>
                  <Input
                    id={`simple-title-${row.id}`}
                    autoFocus={i === rows.length - 1}
                    maxLength={300}
                    required
                    value={row.title}
                    onChange={(e) => setRows((list) => list.map((item) => (item.id === row.id ? { ...item, title: e.target.value } : item)))}
                  />
                </Field>
                <Field label="Price ($)" htmlFor={`simple-price-${row.id}`}>
                  <Input
                    id={`simple-price-${row.id}`}
                    type="number"
                    min={0}
                    step="0.01"
                    required
                    value={row.price}
                    onChange={(e) => setRows((list) => list.map((item) => (item.id === row.id ? { ...item, price: e.target.value } : item)))}
                  />
                </Field>
              </div>
            </div>
          ))}
          <Button type="button" variant="outline" disabled={rows.length >= 50} onClick={() => setRows((list) => [...list, blank()])}>
            <Plus /> Add account
          </Button>
          {error && <p className="text-sm text-state-err">{error}</p>}
          <Button type="submit" className="w-full" loading={busy}>Send request</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
