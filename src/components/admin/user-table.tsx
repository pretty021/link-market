'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { Ban, MessageCircle, Pencil, Plus, Search, Trash2, Unlock } from 'lucide-react';
import { PageTitle } from '@/components/app-shell';
import { ImageUpload, PostImage } from '@/components/post-bits';
import { useOnReconnect, useSocketEvent } from '@/components/providers/realtime';
import { useToast } from '@/components/providers/toast';
import { PaymentTypeSelect } from '@/components/payment-method-picker';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Avatar, Badge, Card, Empty, Field, Input, Spinner } from '@/components/ui/primitives';
import { api, ApiError } from '@/lib/client/api';
import type { ImageInfo, Post, UserRow } from '@/lib/client/types';
import { ACCOUNT_KINDS, ACCOUNT_KIND_LABEL, type AccountKind } from '@/lib/account-kinds';
import { formatPrice, timeAgo } from '@/lib/utils';

type Role = 'CLIENT' | 'CUSTOMER';

export function UserTable({ role }: { role: Role }) {
  const toast = useToast();
  const router = useRouter();
  const [users, setUsers] = useState<UserRow[] | null>(null);
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<UserRow | 'new' | null>(null);
  const [viewing, setViewing] = useState<UserRow | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const isClient = role === 'CLIENT';
  const [completed, setCompleted] = useState<Post[]>([]);

  const load = useCallback(async () => {
    const r = await api<{ users: UserRow[] }>(`/api/admin/users?role=${role}${q ? `&q=${encodeURIComponent(q)}` : ''}`);
    setUsers(r.users);
  }, [role, q]);
  const loadSold = useCallback(async () => {
    if (role !== 'CLIENT') return;
    const r = await api<{ posts: Post[] }>('/api/admin/posts');
    setCompleted(r.posts.filter((post) => post.status === 'COMPLETED'));
  }, [role]);
  useEffect(() => {
    const t = setTimeout(() => void load(), q ? 250 : 0);
    return () => clearTimeout(t);
  }, [load, q]);
  useEffect(() => {
    void loadSold();
  }, [loadSold]);
  useOnReconnect(() => {
    void load();
    void loadSold();
  });
  useSocketEvent('post:updated', () => void loadSold());
  useSocketEvent('post:published', () => void loadSold());
  useSocketEvent<{ userId?: string; online?: boolean }>('presence:update', (p) => {
    if (p.userId) setUsers((prev) => prev?.map((u) => (u.id === p.userId ? { ...u, online: !!p.online } : u)) ?? prev);
  });

  async function act(u: UserRow, action: 'block' | 'unblock' | 'delete' | 'chat') {
    if (action === 'delete' && !window.confirm(`Delete ${u.name}? Their history is kept, but they can no longer log in.`)) return;
    if (action === 'block' && !window.confirm(`Block ${u.name}? They will be logged out everywhere immediately.`)) return;
    setBusy(u.id + action);
    try {
      if (action === 'chat') {
        const r = await api<{ conversationId: string }>('/api/conversations', { json: { userId: u.id } });
        router.push(`/chat?c=${r.conversationId}`);
        return;
      }
      if (action === 'delete') await api(`/api/admin/users/${u.id}`, { method: 'DELETE' });
      else await api(`/api/admin/users/${u.id}/${action}`, { method: 'POST' });
      toast({ title: action === 'delete' ? 'User deleted' : action === 'block' ? 'User blocked' : 'User unblocked', tone: 'success' });
      await load();
    } catch (e) {
      toast({ title: e instanceof ApiError ? e.message : 'Action failed.', tone: 'error' });
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <PageTitle
        title={isClient ? 'Clients' : 'Customers'}
        subtitle={isClient ? 'Sellers · Sold' : 'Buyers · Buy · cart limit'}
        action={<Button onClick={() => setEditing('new')}><Plus /> New {isClient ? 'client' : 'customer'}</Button>}
      />
      <div className="relative mb-4 max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-lo" />
        <Input className="pl-9" placeholder="Name or email…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <Card className="overflow-x-auto">
        {users === null ? (
          <div className="flex justify-center py-12"><Spinner /></div>
        ) : users.length === 0 ? (
          <Empty title={`No ${isClient ? 'clients' : 'customers'} found`} />
        ) : (
          <table className="w-full min-w-[760px] text-sm">
            <thead className="border-b border-line/70 text-left text-xs text-ink-lo">
              <tr>
                <th className="px-4 py-3 font-medium">User</th>
                {isClient && <th className="px-4 py-3 font-medium">Sells</th>}
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 text-right font-medium">{isClient ? 'Sold' : 'Buy'}</th>
                {isClient && <th className="px-4 py-3 text-right font-medium">Payments</th>}
                {!isClient && <th className="px-4 py-3 text-right font-medium">Cart limit</th>}
                <th className="px-4 py-3 font-medium">Last seen</th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/40">
              {users.map((u) => (
                <tr
                  key={u.id}
                  className={isClient ? 'cursor-pointer hover:bg-bg-elev/40' : 'hover:bg-bg-elev/40'}
                  onClick={isClient ? () => setViewing(u) : undefined}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Avatar name={u.name} src={u.image?.url} online={u.online} />
                      <div className="min-w-0">
                        <p className="truncate font-medium">{u.name}</p>
                        <p className="truncate text-xs text-ink-lo">{u.email}</p>
                      </div>
                    </div>
                  </td>
                  {isClient && (
                    <td className="px-4 py-3 text-xs text-ink-mid">
                      {(u.sellerKinds && u.sellerKinds.length > 0 ? u.sellerKinds : ['LINKEDIN' as AccountKind]).map((kind) => ACCOUNT_KIND_LABEL[kind]).join(', ')}
                    </td>
                  )}
                  <td className="px-4 py-3">
                    {u.isBlocked ? <Badge tone="red">Blocked</Badge> : u.online ? <Badge tone="mint">Online</Badge> : <Badge>Offline</Badge>}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums">{isClient ? completed.filter((p) => p.clientId === u.id).length : (u.b_counts ?? 0)}</td>
                  {isClient && <td className="px-4 py-3 text-right tabular-nums">{u.paymentAddresses?.length ?? 0}</td>}
                  {!isClient && <td className="px-4 py-3 text-right tabular-nums">{u.cartLimit}</td>}
                  <td className="px-4 py-3 text-xs text-ink-lo">{u.lastSeenAt ? timeAgo(u.lastSeenAt) : 'Never'}</td>
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" onClick={() => act(u, 'chat')} loading={busy === u.id + 'chat'} title="Start chat"><MessageCircle /></Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditing(u)} title="Edit"><Pencil /></Button>
                      {u.isBlocked ? (
                        <Button size="sm" variant="ghost" onClick={() => act(u, 'unblock')} loading={busy === u.id + 'unblock'} title="Unblock"><Unlock /></Button>
                      ) : (
                        <Button size="sm" variant="ghost" className="text-state-warn" onClick={() => act(u, 'block')} loading={busy === u.id + 'block'} title="Block"><Ban /></Button>
                      )}
                      {isClient && (
                        <Button size="sm" variant="ghost" className="text-state-err" onClick={() => act(u, 'delete')} loading={busy === u.id + 'delete'} title="Delete"><Trash2 /></Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      <UserDialog role={role} user={editing} onClose={() => setEditing(null)} onSaved={() => void load()} />
      {isClient && <SoldAccounts user={viewing} posts={completed} onClose={() => setViewing(null)} />}
    </>
  );
}

function SoldAccounts({ user, posts, onClose }: { user: UserRow | null; posts: Post[]; onClose: () => void }) {
  const sold = user
    ? posts
        .filter((p) => p.clientId === user.id)
        .sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''))
    : [];

  return (
    <Dialog open={!!user} onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={user ? `${user.name} sold` : 'Sold'} description={sold.length === 1 ? '1 completed account' : `${sold.length} completed accounts`} className="max-w-xl">
        {sold.length === 0 ? (
          <Empty title="No sold accounts" hint="Completed accounts show up here." />
        ) : (
          <ul className="-mx-2 divide-y divide-line/60">
            {sold.map((p) => {
              const when = p.completedAt ? new Date(p.completedAt) : null;
              const name = p.name?.trim();
              return (
                <li key={p.id} className="flex items-center gap-3 px-2 py-3">
                  <div className="size-12 shrink-0 overflow-hidden rounded-lg bg-bg-elev ring-1 ring-line/70">
                    <PostImage image={p.image} title={p.title} kind={p.kind} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-ink-hi">{name || p.title}</p>
                    {name && <p className="truncate text-xs text-brand-mint">{p.title}</p>}
                    {when && (
                      <time dateTime={when.toISOString()} className="mt-0.5 block text-[11px] tabular-nums text-ink-lo">
                        {when.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                        <span className="px-1 text-line">·</span>
                        {when.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                      </time>
                    )}
                  </div>
                  <p className="shrink-0 text-sm font-bold tabular-nums text-ink-hi">{formatPrice(p.price)}</p>
                </li>
              );
            })}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}

function UserDialog({ role, user, onClose, onSaved }: { role: Role; user: UserRow | 'new' | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const isNew = user === 'new';
  const isClient = role === 'CLIENT';
  const [form, setForm] = useState({ name: '', email: '', password: '', count: '0', cartLimit: '1' });
  const [addresses, setAddresses] = useState<{ type: string; address: string }[]>([]);
  const [kinds, setKinds] = useState<AccountKind[]>(['LINKEDIN']);
  const [image, setImage] = useState<ImageInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) return;
    setError(null);
    if (user === 'new') {
      setForm({ name: '', email: '', password: '', count: '0', cartLimit: '1' });
      setAddresses([]);
      setKinds(['LINKEDIN']);
      setImage(null);
    } else {
      setForm({
        name: user.name,
        email: user.email,
        password: '',
        count: String((isClient ? user.s_counts : user.b_counts) ?? 0),
        cartLimit: String(user.cartLimit ?? 1),
      });
      setAddresses((user.paymentAddresses ?? []).map(({ type, address }) => ({ type, address })));
      setKinds(user.sellerKinds?.length ? user.sellerKinds : ['LINKEDIN']);
      setImage(user.image);
    }
  }, [user, isClient]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const filled = addresses.filter((a) => a.type.trim() || a.address.trim());
    if (isClient && filled.some((a) => !a.type.trim() || !a.address.trim())) {
      setError('Each payment address needs a type and an address.');
      setBusy(false);
      return;
    }
    if (isClient && kinds.length === 0) {
      setError('Choose at least one account type.');
      setBusy(false);
      return;
    }
    const paymentAddresses = filled.map((a) => ({ type: a.type.trim(), address: a.address.trim() }));
    const counts = isClient ? { paymentAddresses, sellerKinds: kinds } : { b_counts: Number(form.count), cartLimit: Number(form.cartLimit) };
    try {
      if (isNew) {
        await api('/api/admin/users', { json: { role, name: form.name, email: form.email, password: form.password, image, ...counts } });
      } else if (user) {
        await api(`/api/admin/users/${user.id}`, {
          method: 'PATCH',
          json: { name: form.name, email: form.email, image, ...(form.password ? { password: form.password } : {}), ...counts },
        });
      }
      toast({ title: isNew ? 'User created' : 'Changes saved', tone: 'success' });
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save.');
    } finally {
      setBusy(false);
    }
  }

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  return (
    <Dialog open={!!user} onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={`${isNew ? 'New' : 'Edit'} ${isClient ? 'client' : 'customer'}`} className={isClient ? 'max-w-xl' : undefined}>
        <form onSubmit={submit} className="space-y-4">
          <ImageUpload value={image} onChange={setImage} label="Upload photo" round />
          <Field label="Name" htmlFor="u-name"><Input id="u-name" required maxLength={100} value={form.name} onChange={set('name')} /></Field>
          <Field label="Email" htmlFor="u-email"><Input id="u-email" type="email" required value={form.email} onChange={set('email')} /></Field>
          <Field label={isNew ? 'Password (at least 8 characters)' : 'New password (leave empty to keep)'} htmlFor="u-pass">
            <Input id="u-pass" type="password" minLength={8} required={isNew} value={form.password} onChange={set('password')} autoComplete="new-password" />
          </Field>
          {isClient && (
            <div className="space-y-2">
              <p className="text-sm font-semibold text-ink-hi">Sells</p>
              <div className="flex flex-wrap gap-2">
                {ACCOUNT_KINDS.map((kind) => (
                  <label key={kind} className="inline-flex items-center gap-2 rounded-full border border-line px-3 py-1.5 text-sm">
                    <input
                      type="checkbox"
                      checked={kinds.includes(kind)}
                      onChange={() => setKinds((current) => (current.includes(kind) ? current.filter((item) => item !== kind) : [...current, kind]))}
                    />
                    {ACCOUNT_KIND_LABEL[kind]}
                  </label>
                ))}
              </div>
            </div>
          )}
          {isClient && (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-ink-hi">Payment addresses</p>
                <Button type="button" size="sm" variant="outline" onClick={() => setAddresses((rows) => [...rows, { type: '', address: '' }])}>
                  <Plus /> Add
                </Button>
              </div>
              {addresses.length === 0 ? (
                <p className="text-xs text-ink-lo">None yet. A client can have more than one.</p>
              ) : (
                addresses.map((row, i) => (
                  <div key={i} className="grid grid-cols-[minmax(0,9.5rem)_1fr_auto] gap-2">
                    <PaymentTypeSelect
                      value={row.type}
                      onChange={(type) => setAddresses((rows) => rows.map((r, n) => (n === i ? { ...r, type } : r)))}
                    />
                    <Input
                      aria-label="Payment address"
                      placeholder="Address"
                      maxLength={300}
                      value={row.address}
                      onChange={(e) => setAddresses((rows) => rows.map((r, n) => (n === i ? { ...r, address: e.target.value } : r)))}
                    />
                    <Button type="button" size="sm" variant="ghost" className="text-state-err" aria-label="Remove payment address" onClick={() => setAddresses((rows) => rows.filter((_, n) => n !== i))}>
                      <Trash2 />
                    </Button>
                  </div>
                ))
              )}
            </div>
          )}
          {!isClient && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Buy" htmlFor="u-count">
                <Input id="u-count" type="number" min={0} step={1} required value={form.count} onChange={set('count')} />
              </Field>
              <Field label="Cart limit" htmlFor="u-cart">
                <Input id="u-cart" type="number" min={0} step={1} required value={form.cartLimit} onChange={set('cartLimit')} />
              </Field>
            </div>
          )}
          {error && <p className="text-sm text-state-err">{error}</p>}
          <Button type="submit" className="w-full" loading={busy}>{isNew ? 'Create' : 'Save changes'}</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
