'use client';

import { useCallback, useEffect, useState } from 'react';
import { PageTitle } from '@/components/app-shell';
import { AdminAddAccount, AdminEditAccount } from '@/components/admin-add-account';
import { ListToolbar, STAFF_STATUS_OPTIONS, useListControls } from '@/components/list-toolbar';
import { Countdown, PostTitle, StatusBadge } from '@/components/post-bits';
import { useToast } from '@/components/providers/toast';
import { useOnReconnect, useSocketEvent } from '@/components/providers/realtime';
import { Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge, Card, Empty, Spinner } from '@/components/ui/primitives';
import { api, ApiError } from '@/lib/client/api';
import type { Post } from '@/lib/client/types';
import { ACCOUNT_KIND_LABEL, coverClass, coverSrc, type AccountKind } from '@/lib/account-kinds';
import { cn, formatPrice } from '@/lib/utils';

export function AdminAccounts({
  kind,
  title,
  subtitle,
}: {
  kind: AccountKind;
  title: string;
  subtitle: string;
}) {
  const [posts, setPosts] = useState<Post[] | null>(null);
  const list = useListControls(
    `admin-posts-${kind}`,
    STAFF_STATUS_OPTIONS,
    'newest',
    undefined,
    true,
    kind === 'GV' ? ['New', 'Updated', 'Price', '0–9'] : kind === 'GMAIL' ? ['New', 'Updated', 'Price', 'A–Z'] : undefined,
  );
  const view = list.apply(posts);
  const showConnects = kind === 'LINKEDIN';
  const noun = kind === 'LINKEDIN' ? 'links' : `${ACCOUNT_KIND_LABEL[kind]} accounts`;

  const load = useCallback(async () => setPosts((await api<{ posts: Post[] }>(`/api/admin/posts?kind=${kind}`)).posts), [kind]);
  useEffect(() => void load(), [load]);
  useOnReconnect(load);

  const belongs = (p: Post) => (p.kind ?? 'LINKEDIN') === kind;
  const upsert = (p: Post) =>
    setPosts((prev) => {
      if (!prev) return prev;
      if (!belongs(p)) return prev.filter((x) => x.id !== p.id);
      return prev.some((x) => x.id === p.id) ? prev.map((x) => (x.id === p.id ? p : x)) : [p, ...prev];
    });
  useSocketEvent<{ post: Post }>('post:updated', ({ post }) => upsert(post));
  useSocketEvent<{ post: Post }>('post:published', ({ post }) => upsert(post));
  useSocketEvent('post:expired', () => void load());
  useSocketEvent<{ postId: string }>('post:deleted', ({ postId }) => setPosts((prev) => prev?.filter((x) => x.id !== postId) ?? prev));
  useSocketEvent<{ posts: Post[] }>('post:requested', ({ posts: created }) => created.forEach(upsert));
  useSocketEvent<{ postId: string; count: number }>('post:viewers', ({ postId, count }) =>
    setPosts((prev) => prev?.map((p) => (p.id === postId ? { ...p, viewers: count } : p)) ?? prev),
  );

  const shown = view.shown;
  const toast = useToast();
  const [editing, setEditing] = useState<Post | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  // Published and completed accounts can be edited or deleted; not one a buyer is holding.
  const manageable = (p: Post) => p.status === 'PUBLISHED' || p.status === 'COMPLETED';

  async function remove(p: Post) {
    const label = p.name?.trim() || p.title;
    const warn = p.status === 'COMPLETED' ? ' It is already sold; the deal chat stays.' : ' It disappears from every feed and cart.';
    if (!window.confirm(`Delete "${label}"?${warn} This cannot be undone.`)) return;
    setDeleting(p.id);
    try {
      await api(`/api/admin/posts/${p.id}`, { method: 'DELETE' });
      setPosts((prev) => prev?.filter((x) => x.id !== p.id) ?? prev);
      toast({ title: 'Account deleted', tone: 'success' });
    } catch (e) {
      toast({ title: e instanceof ApiError ? e.message : 'Could not delete.', tone: 'error' });
    } finally {
      setDeleting(null);
    }
  }

  return (
    <>
      <PageTitle title={title} subtitle={subtitle} action={<AdminAddAccount kind={kind} onCreated={upsert} />} />
      <ListToolbar
        controls={list}
        counts={view.counts}
        shown={shown?.length ?? 0}
        total={view.total}
        className="mb-4"
      />
      <Card className="overflow-x-auto">
        {shown === null ? (
          <div className="flex justify-center py-12"><Spinner /></div>
        ) : shown.length === 0 ? (
          <Empty title={view.total === 0 ? `No ${noun}` : `No ${noun} match`} hint={view.total === 0 ? undefined : 'Try a different search or status.'} />
        ) : (
          <table className="rtable w-full min-w-[940px] text-sm">
            <thead className="border-b border-line/70 text-left text-xs text-ink-lo">
              <tr>
                <th className="px-4 py-3 font-medium">Link</th>
                <th className="px-4 py-3 font-medium">Client</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Time</th>
                <th className="px-4 py-3 font-medium">Holder</th>
                <th className="px-4 py-3 font-medium">Visible</th>
                <th className="px-4 py-3 font-medium">Countdown</th>
                <th className="px-4 py-3 text-right font-medium">Price</th>
                <th className="px-4 py-3 text-right font-medium">Views</th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/40">
              {shown.map((p) => (
                <tr key={p.id} className="hover:bg-bg-elev/40">
                  <td className="rt-main px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-14 shrink-0 overflow-hidden rounded-lg bg-bg-elev">
                        {p.image?.url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={p.image.url} alt={p.title} className="size-full object-cover" />
                        ) : (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={coverSrc(p.image?.url, p.kind)} alt={p.title} className={coverClass(p.image?.url, p.kind, 'p-0.5')} />
                        )}
                      </div>
                      <div className="min-w-0">
                        <PostTitle post={p} className="max-w-[260px]" headingClassName="font-medium" />
                        {showConnects && <p className="text-xs text-ink-lo">{p.connects} connects</p>}
                      </div>
                    </div>
                  </td>
                  <td data-label="Seller" className="px-4 py-3 text-ink-mid">{p.clientName}</td>
                  <td data-label="Status" className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <StatusBadge status={p.status} clientChecking={!!p.progressingPausedAt} />
                      {p.approval && p.status !== 'REQUESTED' && <Badge tone="slate">Approved</Badge>}
                    </div>
                  </td>
                  <td data-label="Time" className="px-4 py-3">
                    <Stamp at={p.status === 'REQUESTED' ? p.createdAt : p.updatedAt} />
                  </td>
                  <td data-label="Buyer" className="px-4 py-3 text-ink-mid">{p.holderName ?? '-'}</td>
                  <td data-label="Visible" className="px-4 py-3"><VisibilitySwitch post={p} onChange={upsert} /></td>
                  <td data-label="Countdown" className="px-4 py-3">
                    {p.status === 'PROGRESSING' ? <Countdown expiresAt={p.progressingExpiresAt} paused={!!p.progressingPausedAt} onDone={() => void load()} /> : <span className="text-ink-lo">-</span>}
                  </td>
                  <td data-label="Price" className="px-4 py-3 text-right font-semibold">{formatPrice(p.price)}</td>
                  <td data-label="Views" className="px-4 py-3 text-right text-ink-mid">{p.viewCount} <span className="text-ink-lo">({p.viewers} now)</span></td>
                  <td className="rt-actions px-4 py-3">
                    {manageable(p) ? (
                      <div className="flex justify-end gap-1.5">
                        <Button size="icon" variant="outline" className="size-8" onClick={() => setEditing(p)} aria-label="Edit account" title="Edit">
                          <Pencil />
                        </Button>
                        <Button
                          size="icon"
                          variant="outline"
                          className="size-8 text-state-err hover:bg-state-err/10 hover:text-state-err"
                          onClick={() => void remove(p)}
                          loading={deleting === p.id}
                          aria-label="Delete account"
                          title="Delete"
                        >
                          {deleting !== p.id && <Trash2 />}
                        </Button>
                      </div>
                    ) : (
                      <span className="block text-right text-ink-lo">-</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      <AdminEditAccount post={editing} onSaved={upsert} onClose={() => setEditing(null)} />
    </>
  );
}

/** Request rows use the time the client sent them. Every other row uses the last update. */
function Stamp({ at }: { at: string }) {
  const d = new Date(at);
  return (
    <time dateTime={d.toISOString()} className="block text-[11px] leading-tight tabular-nums text-ink-lo">
      <span className="block font-semibold text-ink-mid">{d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
      <span className="mt-0.5 block">{d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}</span>
    </time>
  );
}

/** On/Off for accepted posts: Off hides the post from Customers (its Client still sees it). */
function VisibilitySwitch({ post, onChange }: { post: Post; onChange: (p: Post) => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  if (!post.approval) return <span className="text-ink-lo">-</span>;
  const locked = post.status === 'PROGRESSING';

  async function toggle() {
    setBusy(true);
    try {
      const r = await api<{ post: Post }>(`/api/admin/posts/${post.id}/visibility`, { json: { visible: !post.visible } });
      onChange(r.post);
      toast({ title: r.post.visible ? 'Visible to customers' : 'Hidden from customers', tone: 'success' });
    } catch (e) {
      toast({ title: e instanceof ApiError ? e.message : 'Could not update.', tone: 'error' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={post.visible}
      aria-label={post.visible ? 'Visible to customers. Click to hide.' : 'Hidden from customers. Click to show.'}
      title={locked ? 'A buyer is holding it' : post.visible ? 'Click to hide from customers' : 'Click to show to customers'}
      disabled={busy || locked}
      onClick={toggle}
      className="inline-flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-50"
    >
      <span className={cn('relative h-5 w-9 rounded-full transition-colors', post.visible ? 'bg-primary' : 'bg-line')}>
        <span className={cn('absolute top-0.5 size-4 rounded-full bg-white shadow transition-all', post.visible ? 'left-[18px]' : 'left-0.5')} />
      </span>
      <span className={cn('text-xs font-semibold', post.visible ? 'text-brand-mint' : 'text-ink-lo')}>{post.visible ? 'On' : 'Off'}</span>
    </button>
  );
}
