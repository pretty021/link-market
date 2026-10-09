'use client';

import { useCallback, useEffect, useState } from 'react';
import { PageTitle } from '@/components/app-shell';
import { ListToolbar, STAFF_STATUS_OPTIONS, useListControls } from '@/components/list-toolbar';
import { Countdown, PostImage, PostTitle, StatusBadge } from '@/components/post-bits';
import { useToast } from '@/components/providers/toast';
import { useOnReconnect, useSocketEvent } from '@/components/providers/realtime';
import { Badge, Card, Empty, Spinner } from '@/components/ui/primitives';
import { api, ApiError } from '@/lib/client/api';
import type { Post } from '@/lib/client/types';
import { cn, formatPrice } from '@/lib/utils';

export default function AdminPosts() {
  const [posts, setPosts] = useState<Post[] | null>(null);
  const list = useListControls('admin-posts', STAFF_STATUS_OPTIONS, 'newest');
  const view = list.apply(posts);

  const load = useCallback(async () => setPosts((await api<{ posts: Post[] }>('/api/admin/posts')).posts), []);
  useEffect(() => void load(), [load]);
  useOnReconnect(load);

  const upsert = (p: Post) =>
    setPosts((prev) => (prev ? (prev.some((x) => x.id === p.id) ? prev.map((x) => (x.id === p.id ? p : x)) : [p, ...prev]) : prev));
  useSocketEvent<{ post: Post }>('post:updated', ({ post }) => upsert(post));
  useSocketEvent<{ post: Post }>('post:published', ({ post }) => upsert(post));
  useSocketEvent('post:expired', () => void load());
  useSocketEvent<{ postId: string }>('post:deleted', ({ postId }) => setPosts((prev) => prev?.filter((x) => x.id !== postId) ?? prev));
  useSocketEvent<{ posts: Post[] }>('post:requested', ({ posts: created }) => created.forEach(upsert));
  useSocketEvent<{ postId: string; count: number }>('post:viewers', ({ postId, count }) =>
    setPosts((prev) => prev?.map((p) => (p.id === postId ? { ...p, viewers: count } : p)) ?? prev),
  );

  const shown = view.shown;

  return (
    <>
      <PageTitle title="Posts overview" subtitle="Status, buyer and timer." />
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
          <Empty title={view.total === 0 ? 'No posts' : 'No posts match'} hint={view.total === 0 ? undefined : 'Try a different search or status.'} />
        ) : (
          <table className="w-full min-w-[820px] text-sm">
            <thead className="border-b border-line/70 text-left text-xs text-ink-lo">
              <tr>
                <th className="px-4 py-3 font-medium">Post</th>
                <th className="px-4 py-3 font-medium">Client</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Holder</th>
                <th className="px-4 py-3 font-medium">Visible</th>
                <th className="px-4 py-3 font-medium">Countdown</th>
                <th className="px-4 py-3 text-right font-medium">Price</th>
                <th className="px-4 py-3 text-right font-medium">Views</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/40">
              {shown.map((p) => (
                <tr key={p.id} className="hover:bg-bg-elev/40">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-14 shrink-0 overflow-hidden rounded-lg"><PostImage image={p.image} title={p.title} /></div>
                      <div className="min-w-0">
                        <PostTitle post={p} className="max-w-[260px]" headingClassName="font-medium" />
                        <p className="text-xs text-ink-lo">{p.connects} connects</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-ink-mid">{p.clientName}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <StatusBadge status={p.status} clientChecking={!!p.progressingPausedAt} />
                      {p.approval && p.status !== 'REQUESTED' && <Badge tone="slate">Approved</Badge>}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-ink-mid">{p.holderName ?? '-'}</td>
                  <td className="px-4 py-3"><VisibilitySwitch post={p} onChange={upsert} /></td>
                  <td className="px-4 py-3">
                    {p.status === 'PROGRESSING' ? <Countdown expiresAt={p.progressingExpiresAt} paused={!!p.progressingPausedAt} onDone={() => void load()} /> : <span className="text-ink-lo">-</span>}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold">{formatPrice(p.price)}</td>
                  <td className="px-4 py-3 text-right text-ink-mid">{p.viewCount} <span className="text-ink-lo">({p.viewers} now)</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </>
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
