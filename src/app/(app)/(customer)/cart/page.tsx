'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Copy, Eye, Info, Link2, MessageCircle, Pause, Send, ShoppingCart, Timer, Trash2, X } from 'lucide-react';
import { PageTitle } from '@/components/app-shell';
import { AccountThumb, Chip, LinkedInCard, StatusDot, usesAccountCard } from '@/components/linkedin-card';
import { PaymentMethodPicker, describePayment } from '@/components/payment-method-picker';
import { Countdown, PostTitle, StatusBadge, postLabel } from '@/components/post-bits';
import { useOnReconnect, useSocketEvent } from '@/components/providers/realtime';
import { useMe } from '@/components/providers/session';
import { useToast } from '@/components/providers/toast';
import { Button } from '@/components/ui/button';
import { coverClass, coverSrc } from '@/lib/account-kinds';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Avatar, Badge, Card, Empty, Spinner } from '@/components/ui/primitives';
import { api, ApiError } from '@/lib/client/api';
import { formatMmSs, useCountdown } from '@/lib/client/clock';
import type { CheckStatus, PaymentAddress, Post } from '@/lib/client/types';
import { cn, formatPrice } from '@/lib/utils';

type Item = { addedAt: string; post: Post; heldByMe: boolean; payments?: PaymentAddress[]; latestCheckStatus: CheckStatus | null; conversationId: string | null };
type CartData = { items: Item[]; count: number; cartLimit: number };

export default function CartPage() {
  const { me } = useMe();
  const toast = useToast();
  const router = useRouter();
  const [data, setData] = useState<CartData | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [dialogPostId, setDialogPostId] = useState<string | null>(null);
  const inFlight = useRef(new Set<string>());

  const load = useCallback(async () => setData(await api<CartData>('/api/cart')), []);
  useEffect(() => {
    load().catch(() => setData({ items: [], count: 0, cartLimit: 1 }));
  }, [load]);
  useOnReconnect(load);

  const patchPost = (post: Post) =>
    setData((d) =>
      d && {
        ...d,
        items: d.items.map((i) => (i.post.id === post.id ? { ...i, post, heldByMe: post.holderId === me.id && post.status !== 'PUBLISHED' } : i)),
      },
    );

  useSocketEvent<{ post: Post }>('post:updated', ({ post }) => {
    if (data?.items.some((i) => i.post.id === post.id)) patchPost(post);
  });
  useSocketEvent<{ userId?: string; role?: string; online?: boolean }>('presence:update', ({ userId, role, online }) => {
    if (role !== 'CLIENT' || !userId || online === undefined) return;
    setData((d) => d && { ...d, items: d.items.map((i) => (i.post.clientId === userId ? { ...i, post: { ...i.post, clientOnline: online } } : i)) });
  });
  useSocketEvent('cart:updated', () => void load());
  useSocketEvent('check:updated', () => void load());
  useSocketEvent<{ post: Post; formerHolderId: string; reason?: 'cancelled' }>('post:expired', ({ post, formerHolderId, reason }) => {
    if (formerHolderId === me.id) {
      if (dialogPostId === post.id) setDialogPostId(null);
      if (reason !== 'cancelled') toast({ title: 'Time expired', body: `"${postLabel(post)}" is available again.`, tone: 'error' });
    }
    void load();
  });

  const [cancelling, setCancelling] = useState<string | null>(null);
  async function cancelHold(item: Item) {
    const id = item.post.id;
    if (cancelling || !window.confirm(`Cancel your hold on "${postLabel(item.post)}"? It becomes available to every customer again.`)) return;
    setCancelling(id);
    try {
      const r = await api<{ post: Post }>(`/api/posts/${id}/cancel`, { method: 'POST' });
      patchPost(r.post);
      if (dialogPostId === id) setDialogPostId(null);
      toast({ title: 'Hold cancelled', body: `"${postLabel(item.post)}" is available again.` });
      await load();
    } catch (e) {
      if (e instanceof ApiError && e.data?.post) patchPost(e.data.post as Post);
      toast({ title: e instanceof ApiError ? e.message : 'Could not cancel.', tone: 'error' });
    } finally {
      setCancelling(null);
    }
  }

  async function confirm(item: Item) {
    const id = item.post.id;
    if (inFlight.current.has(id)) return;
    inFlight.current.add(id);
    setConfirming(id);
    try {
      const r = await api<{ post: Post; payments: PaymentAddress[] }>(`/api/posts/${id}/confirm`, { method: 'POST' });
      patchPost(r.post);
      setData((d) => d && { ...d, items: d.items.map((i) => (i.post.id === id ? { ...i, heldByMe: true, payments: r.payments, latestCheckStatus: null } : i)) });
      setDialogPostId(id);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        if (e.data.post) patchPost(e.data.post as Post);
        toast({
          title: e.code === 'ALREADY_PROGRESSING' ? 'Another customer confirmed this link first.' : e.message,
          tone: 'error',
        });
      } else {
        toast({ title: e instanceof ApiError ? e.message : 'Could not confirm.', tone: 'error' });
      }
    } finally {
      inFlight.current.delete(id);
      setConfirming(null);
    }
  }

  async function remove(item: Item) {
    setRemoving(item.post.id);
    try {
      await api(`/api/cart/${item.post.id}`, { method: 'DELETE' });
      await load();
    } catch (e) {
      toast({ title: e instanceof ApiError ? e.message : 'Could not remove.', tone: 'error' });
    } finally {
      setRemoving(null);
    }
  }

  const dialogItem = data?.items.find((i) => i.post.id === dialogPostId) ?? null;
  const linkedIn = data?.items.filter((i) => usesAccountCard(i.post.kind)) ?? []; // LinkedIn, GV, Gmail: the account card
  const others = data?.items.filter((i) => !usesAccountCard(i.post.kind)) ?? [];

  function actions(item: Item, compact: boolean) {
    const { post } = item;
    const held = item.heldByMe && post.status === 'PROGRESSING';
    const pending = item.latestCheckStatus === 'PENDING';
    const round = compact ? 'rounded-xl' : undefined;
    const main = held ? (
      pending && item.conversationId ? (
        <Button variant="purple" className={round} onClick={() => router.push(`/chat?c=${item.conversationId}`)}>
          <MessageCircle /> {compact ? 'Chat' : 'Open deal chat'}
        </Button>
      ) : (
        <Button className={round} onClick={() => setDialogPostId(post.id)}>
          <Send /> {compact ? 'Submit' : 'Submit checking info'}
        </Button>
      )
    ) : (
      <Button className={round} onClick={() => confirm(item)} loading={confirming === post.id} disabled={post.status !== 'PUBLISHED' || confirming !== null}>
        {post.status === 'PROGRESSING' ? 'In progress' : 'Confirm'}
      </Button>
    );
    const secondary = held ? (
      compact ? (
        <Button variant="outline" size="icon" className="size-10 rounded-xl" onClick={() => cancelHold(item)} loading={cancelling === post.id} aria-label="Cancel hold" title="Cancel hold">
          {cancelling !== post.id && <X />}
        </Button>
      ) : (
        <Button variant="ghost" onClick={() => cancelHold(item)} loading={cancelling === post.id}>
          <X /> Cancel hold
        </Button>
      )
    ) : compact ? (
      <Button variant="outline" size="icon" className="size-10 rounded-xl" onClick={() => remove(item)} loading={removing === post.id} aria-label="Remove from cart" title="Remove from cart">
        {removing !== post.id && <Trash2 />}
      </Button>
    ) : (
      <Button variant="ghost" onClick={() => remove(item)} loading={removing === post.id}>
        <Trash2 /> Remove cart
      </Button>
    );
    return compact ? (
      <>
        {secondary}
        {main}
      </>
    ) : (
      <>
        {main}
        {secondary}
      </>
    );
  }

  return (
    <>
      <PageTitle
        title="Your cart"
        subtitle={data ? `${data.count} of ${data.cartLimit} slot${data.cartLimit === 1 ? '' : 's'} used` : ' '}
      />
      {!data ? (
        <div className="flex justify-center py-20"><Spinner /></div>
      ) : data.items.length === 0 ? (
        <Card>
          <Empty icon={<ShoppingCart />} title="Your cart is empty" hint="Add links to start." />
          <div className="flex justify-center pb-10"><Button asChild><Link href="/feed">Browse Links</Link></Button></div>
        </Card>
      ) : (
        <>
          {linkedIn.length > 0 && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {linkedIn.map((item) => {
                const { post } = item;
                const held = item.heldByMe && post.status === 'PROGRESSING';
                return (
                  <LinkedInCard
                    key={post.id}
                    post={post}
                    connects={(post.kind ?? 'LINKEDIN') === 'LINKEDIN' ? post.connects : undefined}
                    badges={
                      <>
                        <StatusBadge status={post.status} mine={held} clientChecking={held && !!post.progressingPausedAt} />
                        {held && item.latestCheckStatus === 'NOT_CHECKED' && <Badge tone="red">Not checked - resubmit</Badge>}
                      </>
                    }
                    chips={
                      <>
                        {held ? (
                          <Countdown expiresAt={post.progressingExpiresAt} paused={!!post.progressingPausedAt} onDone={() => void load()} />
                        ) : (
                          <Chip icon={<Eye />}>{post.viewers} viewing</Chip>
                        )}
                      </>
                    }
                    person={{ name: post.clientName, image: post.clientImage, label: 'Seller', verified: true, online: post.clientOnline }}
                    personStatus={post.clientOnline ? <StatusDot tone="ok">Available</StatusDot> : <StatusDot tone="lo">Away</StatusDot>}
                    action={<div className="flex items-center gap-2">{actions(item, true)}</div>}
                  />
                );
              })}
            </div>
          )}
          {others.length > 0 && (
            <div className={cn('space-y-4', linkedIn.length > 0 && 'mt-6')}>
              {others.map((item) => {
                const { post } = item;
                const held = item.heldByMe && post.status === 'PROGRESSING';
                return (
                  <Card key={post.id} className="flex flex-col gap-4 p-4 sm:flex-row">
                    <div className="h-32 w-full shrink-0 overflow-hidden rounded-xl bg-bg-elev sm:h-28 sm:w-44">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={coverSrc(post.image?.url, post.kind)} alt={post.title} className={coverClass(post.image?.url, post.kind, 'p-3')} />
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col gap-2">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <PostTitle post={post} className="flex-1" />
                        <span className="text-xl font-bold">{formatPrice(post.price)}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-mid">
                        <StatusBadge status={post.status} mine={held} clientChecking={held && !!post.progressingPausedAt} />
                        <span className="flex items-center gap-1"><Eye className="size-3.5" /> {post.viewCount} views</span>
                        {held && <Countdown expiresAt={post.progressingExpiresAt} paused={!!post.progressingPausedAt} onDone={() => void load()} />}
                        {held && item.latestCheckStatus === 'NOT_CHECKED' && <Badge tone="red">Not checked - resubmit</Badge>}
                      </div>
                      <div className="mt-auto flex flex-wrap items-center gap-2 pt-2">{actions(item, false)}</div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}
      <ConfirmDialog
        item={dialogItem}
        onClose={() => setDialogPostId(null)}
        onExpired={() => void load()}
        onCancelHold={(item) => cancelHold(item)}
        cancelling={!!dialogItem && cancelling === dialogItem.post.id}
      />
    </>
  );
}

// Hold window length (matches PROGRESS_MINUTES on the server); used for the progress bar.
const HOLD_MS = 5 * 60_000;

/** Amber "Reserved for you" panel: big time left and a bar that empties. Stops while the client checks. */
function HoldTimer({ post, onExpired }: { post: Post; onExpired: () => void }) {
  const paused = !!post.progressingPausedAt;
  const { ms } = useCountdown(paused ? null : post.progressingExpiresAt, paused ? undefined : onExpired);
  // While paused, the time left is frozen at the moment the check started.
  const left = paused && post.progressingExpiresAt && post.progressingPausedAt
    ? Math.max(0, new Date(post.progressingExpiresAt).getTime() - new Date(post.progressingPausedAt).getTime())
    : ms;
  const urgent = !paused && left > 0 && left < 60_000;
  return (
    <div
      className={cn(
        'rounded-2xl border px-4 py-3.5',
        urgent ? 'border-state-err/40 bg-state-err/10 text-state-err' : 'border-state-warn/40 bg-state-warn/10 text-state-warn',
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="flex items-center gap-2 font-semibold">
          {paused ? <Pause className="size-5" /> : <Timer className="size-5" />}
          {paused ? 'Paused - client is checking' : 'Reserved for you'}
        </p>
        <p className="font-mono text-2xl font-extrabold tabular-nums" aria-label={`Time left ${formatMmSs(left)}`}>
          {formatMmSs(left)}
        </p>
      </div>
      <div className="relative mt-3 h-2 overflow-hidden rounded-full">
        <div className="absolute inset-0 bg-current opacity-15" />
        <div className="relative h-full rounded-full bg-current transition-[width] duration-300" style={{ width: `${Math.min(100, (left / HOLD_MS) * 100)}%` }} />
      </div>
    </div>
  );
}

function StepTitle({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <h3 className="flex items-center gap-3 text-lg font-extrabold text-ink-hi">
      <span className="flex size-7 items-center justify-center rounded-full bg-primary text-sm font-bold text-on-primary">{n}</span>
      {children}
    </h3>
  );
}

function ConfirmDialog({
  item,
  onClose,
  onExpired,
  onCancelHold,
  cancelling,
}: {
  item: Item | null;
  onClose: () => void;
  onExpired: () => void;
  onCancelHold: (item: Item) => void;
  cancelling: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [url, setUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [methodId, setMethodId] = useState<string | null>(null);

  useEffect(() => {
    setUrl('');
    setError(null);
    setMethodId(null);
  }, [item?.post.id]);

  const methods = useMemo(() => (item?.payments ?? []).map(describePayment), [item?.payments]);
  const method = methods.find((m) => m.id === methodId) ?? methods[0] ?? null;

  async function copyAddress(address: string) {
    try {
      await navigator.clipboard.writeText(address);
      toast({ title: 'Copied', tone: 'success' });
    } catch {
      toast({ title: 'Could not copy.', tone: 'error' });
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!item) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ conversationId: string }>(`/api/posts/${item.post.id}/check`, { json: { url, paymentId: method?.id } });
      router.push(`/chat?c=${r.conversationId}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not submit.');
      setBusy(false);
    }
  }

  const post = item?.post;
  const label = post ? postLabel(post) : '';
  const link = post?.name?.trim() ? post.title.replace(/^https?:\/\/(www\.)?/i, '') : null;

  return (
    <Dialog open={!!item} onOpenChange={(o) => !o && onClose()}>
      {item && post && (
        <DialogContent bare title="On hold for you" className="max-w-md rounded-3xl p-5 sm:p-6">
          <div className="flex items-start gap-3.5">
            <AccountThumb name={label} photo={post.image?.url} className="size-14" />
            <div className="min-w-0 flex-1 pt-0.5">
              <DialogTitle className="text-xl font-extrabold leading-tight text-ink-hi">On hold for you</DialogTitle>
              <DialogDescription className="mt-1 truncate text-sm text-ink-mid">
                {label}
                {link && ` · ${link}`}
              </DialogDescription>
            </div>
            <DialogClose className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-bg-elev text-ink-mid transition hover:text-ink-hi" aria-label="Close">
              <X className="size-5" />
            </DialogClose>
          </div>

          <div className="mt-5 space-y-4">
            <HoldTimer post={post} onExpired={onExpired} />

            <div className="flex items-center justify-between gap-3 rounded-2xl bg-bg-elev/70 px-4 py-3.5">
              <div className="flex min-w-0 items-center gap-3">
                <Avatar name={post.clientName} src={post.clientImage?.url} size={44} />
                <div className="min-w-0 leading-tight">
                  <p className="text-xs text-ink-lo">Client</p>
                  <p className="truncate text-base font-extrabold text-ink-hi">{post.clientName}</p>
                </div>
              </div>
              <div className="text-right leading-tight">
                <p className="text-xs text-ink-lo">Amount to pay</p>
                <p className="text-2xl font-extrabold tabular-nums text-ink-hi">{formatPrice(post.price)}</p>
              </div>
            </div>

            <section className="space-y-3 pt-1">
              <StepTitle n={1}>Pay the client</StepTitle>
              {!method ? (
                <p className="rounded-2xl border border-state-warn/40 bg-state-warn/10 px-4 py-3 text-sm text-state-warn">
                  This seller has no payment address yet, so you can&apos;t submit. Contact support, or cancel the hold.
                </p>
              ) : (
                <>
                  <div>
                    <p className="mb-1.5 text-sm text-ink-mid">Payment method</p>
                    <PaymentMethodPicker methods={methods} value={method} onChange={setMethodId} />
                  </div>
                  <div className="flex items-center gap-3 rounded-2xl bg-bg-elev/70 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-ink-lo">Send to this address</p>
                      <p className="mt-1 break-all font-mono text-[15px] text-ink-hi">{method.address}</p>
                    </div>
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      className="size-10 shrink-0 rounded-xl"
                      aria-label={`Copy ${method.type} address`}
                      title="Copy"
                      onClick={() => void copyAddress(method.address)}
                    >
                      <Copy />
                    </Button>
                  </div>
                  {method.warning && <p className="px-1 text-sm text-state-warn">{method.warning}</p>}
                </>
              )}
            </section>

            <form onSubmit={submit} className="space-y-3 pt-1">
              <StepTitle n={2}>Add the checking link</StepTitle>
              <label className="relative block">
                <span className="sr-only">Checking link</span>
                <Link2 className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-ink-lo" />
                <input
                  type="url"
                  required
                  placeholder="https://..."
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  aria-invalid={!!error}
                  className={cn(
                    'w-full rounded-2xl border bg-bg-card py-3.5 pl-12 pr-4 text-base text-ink-hi outline-none transition placeholder:text-ink-lo focus:border-primary focus:ring-4 focus:ring-primary/15',
                    error ? 'border-state-err' : 'border-line',
                  )}
                />
              </label>
              {error ? <p className="px-1 text-sm text-state-err">{error}</p> : <p className="px-1 text-sm text-ink-lo">The client checks it before the timer runs out.</p>}
              <div className="grid grid-cols-[2fr_3fr] gap-3 pt-1">
                <Button type="button" variant="outline" size="lg" className="w-full rounded-2xl" onClick={() => onCancelHold(item)} loading={cancelling} disabled={busy}>
                  <X /> Cancel
                </Button>
                <Button
                  type="submit"
                  size="lg"
                  className="w-full rounded-2xl"
                  loading={busy}
                  disabled={cancelling || !method}
                  title={method ? undefined : 'The seller needs a payment address first'}
                >
                  <Send /> Submit
                </Button>
              </div>
              <p className="flex gap-2.5 rounded-2xl bg-bg-elev/70 px-4 py-3 text-sm text-ink-mid">
                <Info className="mt-0.5 size-4 shrink-0" />
                Cancel releases the link: it goes back to approved and any customer can confirm it again.
              </p>
            </form>
          </div>
        </DialogContent>
      )}
    </Dialog>
  );
}
