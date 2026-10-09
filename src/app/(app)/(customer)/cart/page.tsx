'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Eye, Link2, MessageCircle, Send, ShoppingCart, Trash2, X } from 'lucide-react';
import { PageTitle } from '@/components/app-shell';
import { Countdown, PostImage, PostTitle, StatusBadge, postLabel } from '@/components/post-bits';
import { useOnReconnect, useSocketEvent } from '@/components/providers/realtime';
import { useMe } from '@/components/providers/session';
import { useToast } from '@/components/providers/toast';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Badge, Card, Empty, Field, Input, Spinner } from '@/components/ui/primitives';
import { api, ApiError } from '@/lib/client/api';
import type { CheckStatus, Post } from '@/lib/client/types';
import { formatPrice } from '@/lib/utils';

type Item = { addedAt: string; post: Post; heldByMe: boolean; latestCheckStatus: CheckStatus | null; conversationId: string | null };
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
      const r = await api<{ post: Post }>(`/api/posts/${id}/confirm`, { method: 'POST' });
      patchPost(r.post);
      setData((d) => d && { ...d, items: d.items.map((i) => (i.post.id === id ? { ...i, heldByMe: true, latestCheckStatus: null } : i)) });
      setDialogPostId(id);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        if (e.data.post) patchPost(e.data.post as Post);
        toast({
          title: e.code === 'ALREADY_PROGRESSING' ? 'Another customer confirmed this post first.' : e.message,
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
          <Empty icon={<ShoppingCart />} title="Your cart is empty" hint="Add accounts to start." />
          <div className="flex justify-center pb-10"><Button asChild><Link href="/feed">Browse listings</Link></Button></div>
        </Card>
      ) : (
        <div className="space-y-4">
          {data.items.map((item) => {
            const { post } = item;
            const held = item.heldByMe && post.status === 'PROGRESSING';
            const pending = item.latestCheckStatus === 'PENDING';
            return (
              <Card key={post.id} className="flex flex-col gap-4 p-4 sm:flex-row">
                <div className="h-32 w-full shrink-0 overflow-hidden rounded-xl sm:h-28 sm:w-44">
                  <PostImage image={post.image} title={post.title} />
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <PostTitle post={post} className="flex-1" />
                    <span className="text-xl font-bold">{formatPrice(post.price)}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-mid">
                    <StatusBadge status={post.status} mine={held} clientChecking={held && !!post.progressingPausedAt} />
                    <span className="flex items-center gap-1"><Link2 className="size-3.5" /> {post.connects} connects</span>
                    <span className="flex items-center gap-1"><Eye className="size-3.5" /> {post.viewCount} views</span>
                    {held && <Countdown expiresAt={post.progressingExpiresAt} paused={!!post.progressingPausedAt} onDone={() => void load()} />}
                    {held && item.latestCheckStatus === 'NOT_CHECKED' && <Badge tone="red">Not checked - resubmit</Badge>}
                  </div>
                  <div className="mt-auto flex flex-wrap items-center gap-2 pt-2">
                    {held ? (
                      pending && item.conversationId ? (
                        <Button variant="purple" onClick={() => router.push(`/chat?c=${item.conversationId}`)}>
                          <MessageCircle /> Open deal chat
                        </Button>
                      ) : (
                        <Button onClick={() => setDialogPostId(post.id)}>
                          <Send /> Submit checking info
                        </Button>
                      )
                    ) : (
                      <Button
                        onClick={() => confirm(item)}
                        loading={confirming === post.id}
                        disabled={post.status !== 'PUBLISHED' || confirming !== null}
                      >
                        {post.status === 'PROGRESSING' ? 'In progress' : 'Confirm'}
                      </Button>
                    )}
                    {held && (
                      <Button variant="ghost" onClick={() => cancelHold(item)} loading={cancelling === post.id}>
                        <X /> Cancel hold
                      </Button>
                    )}
                    {!held && (
                      <Button variant="ghost" onClick={() => remove(item)} loading={removing === post.id}>
                        <Trash2 /> Remove cart
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
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
  const [url, setUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setUrl('');
    setError(null);
  }, [item?.post.id]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!item) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ conversationId: string }>(`/api/posts/${item.post.id}/check`, { json: { url } });
      router.push(`/chat?c=${r.conversationId}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not submit.');
      setBusy(false);
    }
  }

  return (
    <Dialog open={!!item} onOpenChange={(o) => !o && onClose()}>
      {item && (
        <DialogContent title="On hold for you" description={postLabel(item.post)}>
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl border border-line bg-bg-base/60 p-3">
              <p className="text-[11px] text-ink-lo">Client</p>
              <p className="mt-0.5 truncate font-semibold">{item.post.clientName}</p>
            </div>
            <div className="rounded-xl border border-line bg-bg-base/60 p-3">
              <p className="text-[11px] text-ink-lo">Price</p>
              <p className="mt-0.5 font-semibold">{formatPrice(item.post.price)}</p>
            </div>
            <div className="flex flex-col justify-center rounded-xl border border-line bg-bg-base/60 p-3">
              <p className="text-[11px] text-ink-lo">Time left</p>
              <Countdown expiresAt={item.post.progressingExpiresAt} paused={!!item.post.progressingPausedAt} onDone={onExpired} className="mt-1 self-start" />
            </div>
          </div>
          <form onSubmit={submit} className="mt-5 space-y-3">
            <Field label="Checking link" htmlFor="check-url" error={error ?? undefined}>
              <Input id="check-url" type="url" required placeholder="https://..." value={url} onChange={(e) => setUrl(e.target.value)} autoFocus />
            </Field>
            <p className="text-xs text-ink-lo">The client checks it before time runs out.</p>
            <div className="grid grid-cols-2 gap-3">
              <Button type="button" variant="outline" className="w-full" onClick={() => onCancelHold(item)} loading={cancelling} disabled={busy}>
                <X /> Cancel
              </Button>
              <Button type="submit" className="w-full" loading={busy} disabled={cancelling}>
                <Send /> Submit
              </Button>
            </div>
            <p className="text-xs text-ink-lo">Cancel releases the post: it goes back to approved and every customer can confirm it again.</p>
          </form>
        </DialogContent>
      )}
    </Dialog>
  );
}
