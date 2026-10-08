'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { Ban, MessageCircle, Pencil, Plus, Search, Trash2, Unlock } from 'lucide-react';
import { PageTitle } from '@/components/app-shell';
import { ImageUpload } from '@/components/post-bits';
import { useOnReconnect, useSocketEvent } from '@/components/providers/realtime';
import { useToast } from '@/components/providers/toast';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Avatar, Badge, Card, Empty, Field, Input, Spinner } from '@/components/ui/primitives';
import { api, ApiError } from '@/lib/client/api';
import type { ImageInfo, UserRow } from '@/lib/client/types';
import { timeAgo } from '@/lib/utils';

type Role = 'CLIENT' | 'CUSTOMER';

export function UserTable({ role }: { role: Role }) {
  const toast = useToast();
  const router = useRouter();
  const [users, setUsers] = useState<UserRow[] | null>(null);
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<UserRow | 'new' | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const isClient = role === 'CLIENT';
  const countKey = isClient ? 's_counts' : 'b_counts';

  const load = useCallback(async () => {
    const r = await api<{ users: UserRow[] }>(`/api/admin/users?role=${role}${q ? `&q=${encodeURIComponent(q)}` : ''}`);
    setUsers(r.users);
  }, [role, q]);
  useEffect(() => {
    const t = setTimeout(() => void load(), q ? 250 : 0);
    return () => clearTimeout(t);
  }, [load, q]);
  useOnReconnect(load);
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
        subtitle={isClient ? 'Sellers who request posts. Clients use s_counts.' : 'Buyers who browse and confirm posts. Customers use b_counts and a cart limit.'}
        action={<Button onClick={() => setEditing('new')}><Plus /> New {isClient ? 'client' : 'customer'}</Button>}
      />
      <div className="relative mb-4 max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-lo" />
        <Input className="pl-9" placeholder="Search name or email" value={q} onChange={(e) => setQ(e.target.value)} />
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
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 text-right font-medium">{countKey}</th>
                {!isClient && <th className="px-4 py-3 text-right font-medium">Cart limit</th>}
                <th className="px-4 py-3 font-medium">Last seen</th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/40">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-bg-elev/40">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Avatar name={u.name} src={u.image?.url} online={u.online} />
                      <div className="min-w-0">
                        <p className="truncate font-medium">{u.name}</p>
                        <p className="truncate text-xs text-ink-lo">{u.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {u.isBlocked ? <Badge tone="red">Blocked</Badge> : u.online ? <Badge tone="mint">Online</Badge> : <Badge>Offline</Badge>}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums">{u[countKey] ?? 0}</td>
                  {!isClient && <td className="px-4 py-3 text-right tabular-nums">{u.cartLimit}</td>}
                  <td className="px-4 py-3 text-xs text-ink-lo">{u.lastSeenAt ? timeAgo(u.lastSeenAt) : 'Never'}</td>
                  <td className="px-4 py-3">
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
    </>
  );
}

function UserDialog({ role, user, onClose, onSaved }: { role: Role; user: UserRow | 'new' | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const isNew = user === 'new';
  const isClient = role === 'CLIENT';
  const [form, setForm] = useState({ name: '', email: '', password: '', count: '0', cartLimit: '1' });
  const [image, setImage] = useState<ImageInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) return;
    setError(null);
    if (user === 'new') {
      setForm({ name: '', email: '', password: '', count: '0', cartLimit: '1' });
      setImage(null);
    } else {
      setForm({
        name: user.name,
        email: user.email,
        password: '',
        count: String((isClient ? user.s_counts : user.b_counts) ?? 0),
        cartLimit: String(user.cartLimit ?? 1),
      });
      setImage(user.image);
    }
  }, [user, isClient]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const counts = isClient ? { s_counts: Number(form.count) } : { b_counts: Number(form.count), cartLimit: Number(form.cartLimit) };
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
      <DialogContent title={`${isNew ? 'New' : 'Edit'} ${isClient ? 'client' : 'customer'}`}>
        <form onSubmit={submit} className="space-y-4">
          <ImageUpload value={image} onChange={setImage} label="Upload photo" round />
          <Field label="Name" htmlFor="u-name"><Input id="u-name" required maxLength={100} value={form.name} onChange={set('name')} /></Field>
          <Field label="Email" htmlFor="u-email"><Input id="u-email" type="email" required value={form.email} onChange={set('email')} /></Field>
          <Field label={isNew ? 'Password (at least 8 characters)' : 'New password (leave empty to keep)'} htmlFor="u-pass">
            <Input id="u-pass" type="password" minLength={8} required={isNew} value={form.password} onChange={set('password')} autoComplete="new-password" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={isClient ? 's_counts' : 'b_counts'} htmlFor="u-count">
              <Input id="u-count" type="number" min={0} step={1} required value={form.count} onChange={set('count')} />
            </Field>
            {!isClient && (
              <Field label="Cart limit" htmlFor="u-cart">
                <Input id="u-cart" type="number" min={0} step={1} required value={form.cartLimit} onChange={set('cartLimit')} />
              </Field>
            )}
          </div>
          {error && <p className="text-sm text-state-err">{error}</p>}
          <Button type="submit" className="w-full" loading={busy}>{isNew ? 'Create' : 'Save changes'}</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
