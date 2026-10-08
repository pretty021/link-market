'use client';

import { useCallback, useEffect, useState } from 'react';
import { PageTitle } from '@/components/app-shell';
import { Countdown, PostImage, StatusBadge } from '@/components/post-bits';
import { useOnReconnect, useSocketEvent } from '@/components/providers/realtime';
import { Badge, Card, Empty, Spinner } from '@/components/ui/primitives';
import { api } from '@/lib/client/api';
import type { Post, PostStatus } from '@/lib/client/types';
import { cn, formatPrice } from '@/lib/utils';

const filters: Array<PostStatus | 'ALL'> = ['ALL', 'REQUESTED', 'PUBLISHED', 'PROGRESSING', 'COMPLETED'];

export default function AdminPosts() {
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [filter, setFilter] = useState<PostStatus | 'ALL'>('ALL');

  const load = useCallback(async () => setPosts((await api<{ posts: Post[] }>('/api/admin/posts')).posts), []);
  useEffect(() => void load(), [load]);
  useOnReconnect(load);

  const upsert = (p: Post) =>
    setPosts((prev) => (prev ? (prev.some((x) => x.id === p.id) ? prev.map((x) => (x.id === p.id ? p : x)) : [p, ...prev]) : prev));
  useSocketEvent<{ post: Post }>('post:updated', ({ post }) => upsert(post));
  useSocketEvent<{ post: Post }>('post:published', ({ post }) => upsert(post));
  useSocketEvent('post:expired', () => void load());
  useSocketEvent<{ posts: Post[] }>('post:requested', ({ posts: created }) => created.forEach(upsert));
  useSocketEvent<{ postId: string; count: number }>('post:viewers', ({ postId, count }) =>
    setPosts((prev) => prev?.map((p) => (p.id === postId ? { ...p, viewers: count } : p)) ?? prev),
  );

  const shown = posts?.filter((p) => filter === 'ALL' || p.status === filter) ?? null;

  return (
    <>
      <PageTitle title="Posts overview" subtitle="Every post with its status, holder and live countdown." />
      <div className="mb-4 flex flex-wrap gap-2">
        {filters.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              'rounded-full border px-3 py-1 text-xs font-semibold transition',
              filter === f ? 'border-primary bg-primary text-on-primary' : 'border-line text-ink-mid hover:text-ink-hi',
            )}
          >
            {f === 'ALL' ? 'All' : f.charAt(0) + f.slice(1).toLowerCase()} {posts && `(${f === 'ALL' ? posts.length : posts.filter((p) => p.status === f).length})`}
          </button>
        ))}
      </div>
      <Card className="overflow-x-auto">
        {shown === null ? (
          <div className="flex justify-center py-12"><Spinner /></div>
        ) : shown.length === 0 ? (
          <Empty title="No posts" />
        ) : (
          <table className="w-full min-w-[820px] text-sm">
            <thead className="border-b border-line/70 text-left text-xs text-ink-lo">
              <tr>
                <th className="px-4 py-3 font-medium">Post</th>
                <th className="px-4 py-3 font-medium">Client</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Holder</th>
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
                        <p className="max-w-[260px] truncate font-medium">{p.title}</p>
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
