'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { Eye, Link2, MessageCircle, ShoppingCart, Users } from 'lucide-react';
import { PageTitle } from '@/components/app-shell';
import { CUSTOMER_STATUS_OPTIONS, ListToolbar, useListControls } from '@/components/list-toolbar';
import { CustomerAccountTable } from '@/components/account-feed-table';
import { AccountViewToggle, useAccountView } from '@/components/account-view';
import { Chip, LinkedInCard, StatusDot, usesAccountCard } from '@/components/linkedin-card';
import { ImageViewer } from '@/components/image-viewer';
import { Countdown, PostTitle, StatusBadge, postLabel } from '@/components/post-bits';
import { useOnReconnect, useRoom, useSocketEvent } from '@/components/providers/realtime';
import { useMe } from '@/components/providers/session';
import { useToast } from '@/components/providers/toast';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Card, Empty, Spinner } from '@/components/ui/primitives';
import { api, ApiError } from '@/lib/client/api';
import type { Post } from '@/lib/client/types';
import { ACCOUNT_KIND_LABEL, coverClass, coverSrc, type AccountKind } from '@/lib/account-kinds';
import { cn, formatPrice } from '@/lib/utils';

type Feed = { posts: Post[]; cartPostIds: string[] };

export function AccountFeed({ kind, title, subtitle }: { kind: AccountKind; title: string; subtitle: string }) {
  const { me } = useMe();
  // Live listings for everyone, plus accounts this Customer completed (they stay the holder).
  const visible = (p: Post) =>
    p.approval && (((p.status === 'PUBLISHED' || p.status === 'PROGRESSING') && p.visible) || (p.status === 'COMPLETED' && p.holderId === me.id));
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
    if ((post.kind ?? 'LINKEDIN') === kind) toast({ title: 'New link', body: post.title, tone: 'success' });
  });
  useSocketEvent<{ post: Post }>('post:updated', ({ post }) => upsert(post));
  useSocketEvent<{ postId: string }>('post:deleted', ({ postId }) => setPosts((prev) => prev?.filter((p) => p.id !== postId) ?? prev));
  useSocketEvent<{ postId: string; count: number }>('post:viewers', ({ postId, count }) =>
    setPosts((prev) => prev?.map((p) => (p.id === postId ? { ...p, viewers: count } : p)) ?? prev),
  );
  // A seller came online or left: update their Available / Away status on the cards.
  useSocketEvent<{ userId?: string; role?: string; online?: boolean }>('presence:update', ({ userId, role, online }) => {
    if (role !== 'CLIENT' || !userId || online === undefined) return;
    setPosts((prev) => prev?.map((p) => (p.clientId === userId ? { ...p, clientOnline: online } : p)) ?? prev);
  });
  useSocketEvent<{ postIds: string[] }>('cart:updated', ({ postIds }) => setCart(new Set(postIds)));
  useSocketEvent<{ post: Post; formerHolderId: string; reason?: 'cancelled' }>('post:expired', ({ post, formerHolderId, reason }) => {
    upsert(post);
    if (formerHolderId === me.id && reason !== 'cancelled' && (post.kind ?? 'LINKEDIN') === kind) toast({ title: 'Time expired', body: `"${post.title}" is available again.`, tone: 'error' });
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
  const scoped = posts === null ? null : posts.filter((p) => (p.kind ?? 'LINKEDIN') === kind);
  const list = useListControls(
    `customer-feed-${kind}`,
    CUSTOMER_STATUS_OPTIONS,
    'newest',
    ['all', 'title', 'seller'],
    true,
    kind === 'GV' ? ['New', 'Updated', 'Price', '0–9'] : kind === 'GMAIL' ? ['New', 'Updated', 'Price', 'A–Z'] : undefined,
  );
  const view = list.apply(scoped);
  const alive = view.shown?.filter((p) => p.status !== 'COMPLETED') ?? [];
  const completed = view.shown?.filter((p) => p.status === 'COMPLETED') ?? [];

  const [layout, setLayout] = useAccountView('customer-account-view');
  const group = (items: Post[]) =>
    layout === 'table' ? (
      <Card className="overflow-hidden p-0">
        <CustomerAccountTable
          posts={items}
          kind={kind}
          meId={me.id}
          cart={cart}
          busy={busy}
          onOpen={(p) => setOpenId(p.id)}
          onToggleCart={(p) => void toggleCart(p)}
          onExpired={() => void load()}
        />
      </Card>
    ) : (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{items.map(usesAccountCard(kind) ? renderCard : renderLegacyCard)}</div>
    );

  const renderCard = (p: Post) => (
    <LinkCard
      key={p.id}
      post={p}
      mine={p.holderId === me.id}
      inCart={cart.has(p.id)}
      busy={busy === p.id}
      onOpen={() => setOpenId(p.id)}
      onToggleCart={() => void toggleCart(p)}
      onExpired={() => void load()}
    />
  );
  const renderLegacyCard = (p: Post) => (
    <OtherAccountCard
      key={p.id}
      post={p}
      mine={p.holderId === me.id}
      inCart={cart.has(p.id)}
      busy={busy === p.id}
      onOpen={() => setOpenId(p.id)}
      onToggleCart={() => void toggleCart(p)}
      onExpired={() => void load()}
    />
  );

  return (
    <>
      <PageTitle
        title={title}
        subtitle={subtitle}
        action={
          <div className="flex flex-wrap items-center gap-2">
            {scoped && scoped.length > 0 && <AccountViewToggle value={layout} onChange={setLayout} />}
            <Button asChild variant="purple">
              <Link href="/cart">
                <ShoppingCart /> Go to cart ({cart.size})
              </Link>
            </Button>
          </div>
        }
      />
      {scoped && scoped.length > 0 && (
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
          {scoped!.length === 0 ? (
            <Card><Empty icon={<Link2 />} title={kind === 'LINKEDIN' ? 'No links right now' : `No ${ACCOUNT_KIND_LABEL[kind]} accounts right now`} hint="New ones appear live." /></Card>
          ) : alive.length === 0 && completed.length === 0 ? (
            <Card><Empty icon={<Link2 />} title="No links match" hint="Try other filters." /></Card>
          ) : (
            alive.length > 0 && group(alive)
          )}
          {completed.length > 0 && (
            <section className="mt-12">
              <div className="mb-4 flex items-center gap-3">
                <h2 className="text-lg font-semibold">Bought</h2>
                <span className="rounded-md bg-state-ok/15 px-2 py-0.5 text-xs font-semibold text-state-ok">{completed.length}</span>
              </div>
              {group(completed)}
            </section>
          )}
        </>
      )}
      {usesAccountCard(kind) ? (
        open?.detailImage && <DetailImage post={open} src={open.detailImage.url} onClose={() => setOpenId(null)} />
      ) : (
        <PostDetail post={open} onClose={() => setOpenId(null)} />
      )}
    </>
  );
}

type CardProps = {
  post: Post;
  mine: boolean;
  inCart: boolean;
  busy: boolean;
  onOpen: () => void;
  onToggleCart: () => void;
  onExpired: () => void;
};

/** LinkedIn accounts: the shared LinkedIn card. */
function LinkCard({ post, mine, inCart, busy, onOpen, onToggleCart, onExpired }: CardProps) {
  const done = post.status === 'COMPLETED';
  return (
    <LinkedInCard
      post={post}
      onOpen={post.detailImage ? onOpen : undefined}
      connects={(post.kind ?? 'LINKEDIN') === 'LINKEDIN' ? post.connects : undefined}
      badges={<StatusBadge status={post.status} mine={mine} clientChecking={mine && !!post.progressingPausedAt} />}
      chips={
        <>
          {!done && <Chip icon={<Eye />}>{post.viewers} viewing</Chip>}
          {post.status === 'PROGRESSING' && mine && (
            <Countdown expiresAt={post.progressingExpiresAt} paused={!!post.progressingPausedAt} onDone={onExpired} />
          )}
        </>
      }
      person={{ name: post.clientName, image: post.clientImage, label: 'Seller', verified: true, online: post.clientOnline }}
      personStatus={post.clientOnline ? <StatusDot tone="ok">Available</StatusDot> : <StatusDot tone="lo">Away</StatusDot>}
      action={
        done ? (
          <Button asChild size="sm" variant="outline" className="size-9 rounded-lg px-0"><Link href="/chat" aria-label="Messages" title="Messages"><MessageCircle /></Link></Button>
        ) : mine ? (
          <Button asChild size="sm" variant="purple" className="rounded-lg"><Link href="/cart">Open in cart</Link></Button>
        ) : (
          <Button
            size="sm"
            variant={inCart ? 'outline' : 'primary'}
            loading={busy}
            disabled={!inCart && post.status !== 'PUBLISHED'}
            onClick={onToggleCart}
            className="rounded-lg px-3"
          >
            <ShoppingCart /> {inCart ? 'Remove' : post.status === 'PROGRESSING' ? 'In progress' : 'Add'}
          </Button>
        )
      }
    />
  );
}

/** GV, Gmail, WhatsApp and Telegram accounts. */
function OtherAccountCard({
  post,
  mine,
  inCart,
  busy,
  onOpen,
  onToggleCart,
  onExpired,
}: {
  post: Post;
  mine: boolean;
  inCart: boolean;
  busy: boolean;
  onOpen: () => void;
  onToggleCart: () => void;
  onExpired: () => void;
}) {
  const done = post.status === 'COMPLETED';
  const when = new Date(post.updatedAt);
  return (
    <Card className="flex flex-col overflow-hidden p-0">
      <div className="flex items-center justify-between gap-2 bg-bg-elev/70 px-3 py-2">
        <StatusBadge status={post.status} mine={mine} clientChecking={mine && !!post.progressingPausedAt} />
        <time dateTime={when.toISOString()} className="shrink-0 text-right text-[11px] leading-tight tabular-nums text-ink-lo">
          <span className="block font-semibold text-ink-mid">{when.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
          <span className="block">{when.toLocaleDateString([], { month: 'short', day: 'numeric' })}</span>
        </time>
      </div>
      <button type="button" onClick={onOpen} className="block h-32 w-full overflow-hidden bg-bg-elev text-left" aria-label={`Open ${post.title}`}>
        <Cover image={post.image} kind={post.kind} title={post.title} />
      </button>
      <div className="space-y-2 px-3.5 py-3">
        <div className="flex items-start justify-between gap-3">
          <PostTitle post={post} className="min-w-0 flex-1" onHeadingClick={onOpen} />
          <span className="shrink-0 text-base font-bold tabular-nums">{formatPrice(post.price)}</span>
        </div>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-mid">
          {(post.kind ?? 'LINKEDIN') === 'LINKEDIN' && <span className="inline-flex items-center gap-1"><Link2 className="size-3.5" /> {post.connects} connects</span>}
          <span className="inline-flex items-center gap-1"><Users className="size-3.5" /> {post.clientName}</span>
        </p>
        {!done && (
          <p className="inline-flex items-center gap-1 text-xs text-ink-lo">
            <Eye className="size-3.5" /> {post.viewers} viewing
          </p>
        )}
      </div>
      <div className="mt-auto flex items-center justify-between gap-2 border-t border-line/70 px-3.5 py-2.5">
        {done ? (
          <span className="text-xs font-medium text-state-ok">Bought</span>
        ) : post.status === 'PROGRESSING' && mine ? (
          <Countdown expiresAt={post.progressingExpiresAt} paused={!!post.progressingPausedAt} onDone={onExpired} />
        ) : (
          <span className="text-xs text-ink-lo">{post.status === 'PROGRESSING' ? 'In progress' : 'Available'}</span>
        )}
        {done ? (
          <Button asChild size="sm" variant="outline" className="size-9 px-0"><Link href="/chat" aria-label="Messages" title="Messages"><MessageCircle /></Link></Button>
        ) : mine ? (
          <Button asChild size="sm" variant="purple"><Link href="/cart">Open in cart</Link></Button>
        ) : (
          <Button
            size="sm"
            variant={inCart ? 'outline' : 'primary'}
            loading={busy}
            disabled={!inCart && post.status !== 'PUBLISHED'}
            onClick={onToggleCart}
          >
            <ShoppingCart /> {inCart ? 'Remove cart' : 'Cart'}
          </Button>
        )}
      </div>
    </Card>
  );
}

/** LinkedIn accounts: opening the card shows only the detail image, full screen with zoom. */
function DetailImage({ post, src, onClose }: { post: Post; src: string; onClose: () => void }) {
  useRoom('post', post.id);
  useEffect(() => {
    api(`/api/posts/${post.id}`).catch(() => undefined); // records a unique view
  }, [post.id]);
  return <ImageViewer src={src} alt={postLabel(post)} onClose={onClose} />;
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
        <DialogContent title={postLabel(post)} description={`Seller: ${post.clientName}`} className="max-w-xl">
          {post.name && <PostTitle post={{ name: null, title: post.title }} headingClassName="text-sm font-normal text-brand-mint" className="-mt-2 mb-3" />}
          <div className="h-56 overflow-hidden rounded-xl">
            <Cover image={post.image} kind={post.kind} title={post.title} />
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            {[
              ['Price', formatPrice(post.price)],
              ...((post.kind ?? 'LINKEDIN') === 'LINKEDIN' ? [['Connects', post.connects] as const] : []),
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

function Cover({ image, kind, title, className }: { image: Post['image']; kind?: Post['kind']; title: string; className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={coverSrc(image?.url, kind)} alt={title} className={cn(coverClass(image?.url, kind, 'p-2'), className)} />;
}
