'use client';

import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Inbox, Save, Timer, UserCheck, Users } from 'lucide-react';
import { PageTitle } from '@/components/app-shell';
import { ImageUpload, PostImage } from '@/components/post-bits';
import { useOnReconnect, useSocketEvent } from '@/components/providers/realtime';
import { useToast } from '@/components/providers/toast';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, Empty, Field, Input, Spinner } from '@/components/ui/primitives';
import { api, ApiError } from '@/lib/client/api';
import type { ImageInfo, Post } from '@/lib/client/types';
import { timeAgo } from '@/lib/utils';

type Stats = { clientsOnline: number; clientsTotal: number; customersOnline: number; customersTotal: number; requested: number; progressing: number };

function StatCard({ icon, label, value, total, tone }: { icon: React.ReactNode; label: string; value: number; total?: number; tone: 'mint' | 'purple' }) {
  return (
    <Card className="relative overflow-hidden p-5">
      <div className={`absolute -right-8 -top-8 size-28 rounded-full blur-2xl ${tone === 'mint' ? 'bg-brand-mint/20' : 'bg-brand-purple/25'}`} />
      <div className={`relative mb-3 flex size-10 items-center justify-center rounded-xl ${tone === 'mint' ? 'bg-grad-mint text-bg-deep' : 'bg-grad-purple text-white'}`}>{icon}</div>
      <p className="relative text-xs text-ink-lo">{label}</p>
      <p className="relative mt-1 text-3xl font-bold tabular-nums">
        {value}
        {total !== undefined && <span className="text-lg font-semibold text-ink-lo"> / {total}</span>}
      </p>
    </Card>
  );
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [requests, setRequests] = useState<Post[] | null>(null);

  const loadStats = useCallback(async () => setStats((await api<{ stats: Stats }>('/api/admin/stats')).stats), []);
  const loadRequests = useCallback(async () => setRequests((await api<{ posts: Post[] }>('/api/admin/posts?status=REQUESTED')).posts), []);

  useEffect(() => {
    void loadStats();
    void loadRequests();
    const id = setInterval(() => void loadStats(), 30_000);
    return () => clearInterval(id);
  }, [loadStats, loadRequests]);
  useOnReconnect(() => {
    void loadStats();
    void loadRequests();
  });

  useSocketEvent<{ stats?: Stats }>('presence:update', (p) => (p.stats ? setStats(p.stats) : void loadStats()));
  useSocketEvent<{ posts: Post[] }>('post:requested', ({ posts }) => {
    setRequests((prev) => (prev ? [...prev, ...posts.filter((p) => !prev.some((x) => x.id === p.id))] : prev));
    void loadStats();
  });
  useSocketEvent<{ post: Post }>('post:published', ({ post }) => {
    setRequests((prev) => prev?.filter((p) => p.id !== post.id) ?? prev);
    void loadStats();
  });
  useSocketEvent<{ post: Post }>('post:updated', ({ post }) => {
    if (post.status === 'REQUESTED') setRequests((prev) => prev?.map((p) => (p.id === post.id ? post : p)) ?? prev);
    void loadStats();
  });

  return (
    <>
      <PageTitle title="Admin dashboard" subtitle="Live overview of people and posts." />
      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard icon={<UserCheck className="size-5" />} label="Clients online / total" value={stats?.clientsOnline ?? 0} total={stats?.clientsTotal ?? 0} tone="mint" />
        <StatCard icon={<Users className="size-5" />} label="Customers online / total" value={stats?.customersOnline ?? 0} total={stats?.customersTotal ?? 0} tone="purple" />
        <StatCard icon={<Inbox className="size-5" />} label="Post requests" value={stats?.requested ?? 0} tone="mint" />
        <StatCard icon={<Timer className="size-5" />} label="In progress now" value={stats?.progressing ?? 0} tone="purple" />
      </div>

      <Card>
        <CardHeader title="Post requests" subtitle="Set the image, connects and price, save, then accept to publish to every customer." icon={<Inbox className="size-5" />} />
        {requests === null ? (
          <div className="flex justify-center py-12"><Spinner /></div>
        ) : requests.length === 0 ? (
          <Empty icon={<CheckCircle2 />} title="No pending requests" hint="New requests from clients appear here live." />
        ) : (
          <ul className="divide-y divide-line/50">
            {requests.map((p) => (
              <RequestRow key={p.id} post={p} onAccepted={() => setRequests((prev) => prev?.filter((x) => x.id !== p.id) ?? prev)} />
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}

function RequestRow({ post, onAccepted }: { post: Post; onAccepted: () => void }) {
  const toast = useToast();
  const [image, setImage] = useState<ImageInfo | null>(post.image);
  const [connects, setConnects] = useState(String(post.connects));
  const [price, setPrice] = useState(post.price !== null ? post.price.toFixed(2) : '');
  const [saving, setSaving] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [saved, setSaved] = useState(post);

  const dirty =
    (image?.key ?? null) !== (saved.image?.key ?? null) ||
    Number(connects) !== saved.connects ||
    (price === '' ? null : Math.round(Number(price) * 100) / 100) !== saved.price;

  async function save() {
    setSaving(true);
    try {
      const r = await api<{ post: Post }>(`/api/admin/posts/${post.id}`, {
        method: 'PATCH',
        json: { image, connects: Number(connects || 0), ...(price !== '' ? { price: Number(price) } : {}) },
      });
      setSaved(r.post);
      setPrice(r.post.price !== null ? r.post.price.toFixed(2) : '');
      toast({ title: 'Saved', tone: 'success' });
    } catch (e) {
      toast({ title: e instanceof ApiError ? e.message : 'Could not save.', tone: 'error' });
    } finally {
      setSaving(false);
    }
  }

  async function accept() {
    setAccepting(true);
    try {
      await api(`/api/admin/posts/${post.id}/accept`, { method: 'POST', json: {} });
      toast({ title: 'Post accepted', body: 'It is now live in every customer feed.', tone: 'success' });
      onAccepted();
    } catch (e) {
      toast({ title: e instanceof ApiError ? e.message : 'Could not accept.', tone: 'error' });
      setAccepting(false);
    }
  }

  return (
    <li className="grid gap-4 p-5 lg:grid-cols-[1fr_auto]">
      <div className="flex gap-4">
        <div className="hidden h-20 w-28 shrink-0 overflow-hidden rounded-xl sm:block">
          <PostImage image={image} title={post.title} />
        </div>
        <div className="min-w-0">
          <p className="font-semibold">{post.title}</p>
          <p className="mt-1 text-xs text-ink-lo">From {post.clientName} · {timeAgo(post.createdAt)}</p>
          <div className="mt-3"><ImageUpload value={image} onChange={setImage} /></div>
        </div>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-28">
          <Field label="Connects" htmlFor={`c-${post.id}`}>
            <Input id={`c-${post.id}`} type="number" min={0} step={1} value={connects} onChange={(e) => setConnects(e.target.value)} />
          </Field>
        </div>
        <div className="w-32">
          <Field label="Price ($)" htmlFor={`p-${post.id}`}>
            <Input id={`p-${post.id}`} type="number" min={0} step="0.01" placeholder="35.01" value={price} onChange={(e) => setPrice(e.target.value)} />
          </Field>
        </div>
        <Button variant="outline" onClick={save} loading={saving} disabled={!dirty}><Save /> Save</Button>
        <Button onClick={accept} loading={accepting} disabled={dirty || saved.price === null} title={saved.price === null ? 'Save a price first' : dirty ? 'Save your changes first' : undefined}>
          <CheckCircle2 /> Accept
        </Button>
      </div>
    </li>
  );
}
