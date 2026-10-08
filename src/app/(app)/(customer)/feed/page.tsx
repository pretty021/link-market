'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { Eye, Link2, MessageCircle, ShoppingCart, Users } from 'lucide-react';
import { PageTitle } from '@/components/app-shell';
import { CUSTOMER_STATUS_OPTIONS, ListToolbar, useListControls } from '@/components/list-toolbar';
import { Countdown, PostImage, StatusBadge } from '@/components/post-bits';
import { useOnReconnect, useRoom, useSocketEvent } from '@/components/providers/realtime';
import { useMe } from '@/components/providers/session';
import { useToast } from '@/components/providers/toast';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Card, Empty, Spinner } from '@/components/ui/primitives';
import { api, ApiError } from '@/lib/client/api';
import type { Post } from '@/lib/client/types';
import { cn, formatPrice } from '@/lib/utils';

type Feed = { posts: Post[]; cartPostIds: string[] };

export default function FeedPage() {
  const { me } = useMe();
  // Live listings for everyone, plus accounts this Customer completed (they stay the holder).
  const visible = (p: Post) =>
    p.approval && (p.status === 'PUBLISHED' || p.status === 'PROGRESSING' || (p.status === 'COMPLETED' && p.holderId === me.id));
  const toast = useToast();
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [cart, setCart] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await api<Feed>('/api/posts');
    setPosts(r.posts);
    setCart(new Set(r.cartPostIds));
  }, []);
  useEffect(() => {
    load().catch(() => setPosts([]));
  }, [load]);
  useOnReconnect(load);

  const upsert = (p: Post) =>
    setPosts((prev) => {
      if (!prev) return prev;
      const rest = prev.filter((x) => x.id !== p.id);
      if (!visible(p)) return rest;
      const existing = prev.find((x) => x.id === p.id);
      return existing ? prev.map((x) => (x.id === p.id ? p : x)) : [p, ...rest];
    });

  useSocketEvent<{ post: Post }>('post:published', ({ post }) => {
    upsert(post);
    toast({ title: 'New listing', body: post.title, tone: 'success' });
  });
  useSocketEvent<{ post: Post }>('post:updated', ({ post }) => upsert(post));
  useSocketEvent<{ postId: string; count: number }>('post:viewers', ({ postId, count }) =>
    setPosts((prev) => prev?.map((p) => (p.id === postId ? { ...p, viewers: count } : p)) ?? prev),
  );
  useSocketEvent<{ postIds: string[] }>('cart:updated', ({ postIds }) => setCart(new Set(postIds)));
  useSocketEvent<{ post: Post; formerHolderId: string; reason?: 'cancelled' }>('post:expired', ({ post, formerHolderId, reason }) => {
    upsert(post);
    if (formerHolderId === me.id && reason !== 'cancelled') toast({ title: 'Time expired', body: `"${post.title}" is available again.`, tone: 'error' });
  });

  async function toggleCart(p: Post) {
    setBusy(p.id);
    try {
      const inCart = cart.has(p.id);
      const r = await api<{ postIds: string[] }>(`/api/cart/${p.id}`, { method: inCart ? 'DELETE' : 'POST' });
      setCart(new Set(r.postIds));
    } catch (e) {
      toast({ title: e instanceof ApiError && e.code === 'CART_LIMIT_REACHED' ? 'Cart limit reached' : 'Could not update cart', body: e instanceof ApiError ? e.message : undefined, tone: 'error' });
    } finally {
      setBusy(null);
    }
  }

  const open = posts?.find((p) => p.id === openId) ?? null;
  const list = useListControls('customer-feed', CUSTOMER_STATUS_OPTIONS, 'newest', ['all', 'title', 'seller']);
  const view = list.apply(posts);
  const alive = view.shown?.filter((p) => p.status !== 'COMPLETED') ?? [];
  const completed = view.shown?.filter((p) => p.status === 'COMPLETED') ?? [];

  const renderCard = (p: Post) => {
    const mine = p.holderId === me.id;
    const inCart = cart.has(p.id);
    const done = p.status === 'COMPLETED';
    return (
      <Card
        key={p.id}
        className={cn('flex flex-col overflow-hidden transition', done ? 'border-state-err/25 bg-state-err/[0.06]' : 'hover:border-brand-mint/40')}
      >
        <button onClick={() => setOpenId(p.id)} className="relative h-36 w-full overflow-hidden text-left" aria-label={`Open ${p.title}`}>
          <PostImage image={p.image} title={p.title} className={done ? 'opacity-80' : undefined} />
          <div className="absolute left-3 top-3 flex overflow-hidden rounded-md bg-bg-card shadow-soft"><StatusBadge status={p.status} mine={mine} clientChecking={mine && !!p.progressingPausedAt} /></div>
          {!done && (
            <div className="absolute right-3 top-3 flex items-center gap-1 rounded-md bg-bg-card px-2 py-0.5 text-[11px] text-ink-mid shadow-soft">
              <Eye className="size-3" /> {p.viewers} viewing
            </div>
          )}
        </button>
        <div className="flex flex-1 flex-col gap-3 p-4">
          <div className="flex items-start justify-between gap-3">
            <button onClick={() => setOpenId(p.id)} className="line-clamp-2 text-left font-semibold hover:text-brand-mint">{p.title}</button>
            <span className="shrink-0 text-lg font-bold">{formatPrice(p.price)}</span>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-mid">
            <span className="flex items-center gap-1"><Link2 className="size-3.5" /> {p.connects} connects</span>
            <span className="flex items-center gap-1"><Users className="size-3.5" /> Seller: {p.clientName}</span>
          </div>
          <div className="mt-auto flex items-center justify-between gap-2 pt-1">
            {done ? (
              <span className="text-xs font-medium text-state-err">Bought</span>
            ) : p.status === 'PROGRESSING' ? (
              mine ? <Countdown expiresAt={p.progressingExpiresAt} paused={!!p.progressingPausedAt} onDone={() => void load()} /> : <span className="text-xs font-medium text-brand-purpleSoft">In progress</span>
            ) : (
              <span className="text-xs text-ink-lo">Available</span>
            )}
            {done ? (
              <Button asChild size="sm" variant="outline"><Link href="/chat"><MessageCircle /> Messages</Link></Button>
            ) : mine ? (
              <Button asChild size="sm" variant="purple"><Link href="/cart">Open in cart</Link></Button>
            ) : (
              <Button
                size="sm"
                variant={inCart ? 'outline' : 'primary'}
                loading={busy === p.id}
                disabled={!inCart && p.status !== 'PUBLISHED'}
                onClick={() => toggleCart(p)}
              >
                <ShoppingCart /> {inCart ? 'Remove cart' : 'Cart'}
              </Button>
            )}
          </div>
        </div>
      </Card>
    );
  };

  return (
    <>
      <PageTitle
        title="Latest Accounts"
        subtitle="Reviewed. Updated live."
        action={
          <Button asChild variant="purple">
            <Link href="/cart">
              <ShoppingCart /> Go to cart ({cart.size})
            </Link>
          </Button>
        }
      />
      {posts && posts.length > 0 && (
        <ListToolbar
          controls={list}
          counts={view.counts}
          shown={view.shown?.length ?? 0}
          total={view.total}
          className="mb-6"
        />
      )}
      {posts === null ? (
        <div className="flex justify-center py-20"><Spinner /></div>
      ) : (
        <>
          {posts.length === 0 ? (
            <Card><Empty icon={<Link2 />} title="No listings right now" hint="New ones appear live." /></Card>
          ) : alive.length === 0 && completed.length === 0 ? (
            <Card><Empty icon={<Link2 />} title="No listings match" hint="Try other filters." /></Card>
          ) : (
            alive.length > 0 && <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{alive.map(renderCard)}</div>
          )}
          {completed.length > 0 && (
            <section className="mt-12">
              <div className="mb-4 flex items-center gap-3">
                <h2 className="text-lg font-semibold">Bought</h2>
                <span className="rounded-md bg-state-err/10 px-2 py-0.5 text-xs font-semibold text-state-err">{completed.length}</span>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{completed.map(renderCard)}</div>
            </section>
          )}
        </>
      )}
      <PostDetail post={open} onClose={() => setOpenId(null)} />
    </>
  );
}

/** Opening a post records a unique view and joins its room so "viewing" counts are live. */
function PostDetail({ post, onClose }: { post: Post | null; onClose: () => void }) {
  const [viewCount, setViewCount] = useState<number | null>(null);
  useRoom('post', post?.id);
  useEffect(() => {
    if (!post) return;
    setViewCount(null);
    api<{ post: Post }>(`/api/posts/${post.id}`).then((r) => setViewCount(r.post.viewCount)).catch(() => undefined);
  }, [post?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Dialog open={!!post} onOpenChange={(o) => !o && onClose()}>
      {post && (
        <DialogContent title={post.title} description={`Seller: ${post.clientName}`} className="max-w-xl">
          <div className="h-56 overflow-hidden rounded-xl">
            <PostImage image={post.image} title={post.title} />
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            {[
              ['Price', formatPrice(post.price)],
              ['Connects', post.connects],
              ['Viewing now', post.viewers],
              ['Total views', viewCount ?? '…'],
            ].map(([k, v]) => (
              <div key={k as string} className="rounded-xl border border-line bg-bg-base/60 p-3">
                <dt className="text-[11px] text-ink-lo">{k}</dt>
                <dd className="mt-0.5 font-semibold">{v}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-4 flex items-center justify-between">
            <StatusBadge status={post.status} />
            <Button asChild variant="purple" size="sm"><Link href="/cart">Go to cart to confirm</Link></Button>
          </div>
        </DialogContent>
      )}
    </Dialog>
  );
}
