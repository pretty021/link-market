'use client';

import { useEffect, useState } from 'react';
import { KeyRound, Plus, Trash2, UserRound } from 'lucide-react';
import { PageTitle } from '@/components/app-shell';
import { ImageUpload } from '@/components/post-bits';
import { useMe } from '@/components/providers/session';
import { useToast } from '@/components/providers/toast';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, Field, Input } from '@/components/ui/primitives';
import { api, ApiError } from '@/lib/client/api';
import type { ImageInfo, Me, Post } from '@/lib/client/types';

export default function ProfilePage() {
  const { me, setMe } = useMe();
  const toast = useToast();
  const [name, setName] = useState(me.name ?? '');
  const [email, setEmail] = useState(me.email);
  const [image, setImage] = useState<ImageInfo | null>(me.kind === 'user' ? me.image : null);
  const [saving, setSaving] = useState(false);
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [pwBusy, setPwBusy] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);
  const [sold, setSold] = useState(0);
  const [addresses, setAddresses] = useState<{ type: string; address: string }[]>([]);
  const [addressesReady, setAddressesReady] = useState(false);
  const isClient = me.kind === 'user' && me.role === 'CLIENT';

  useEffect(() => {
    if (!isClient) return;
    api<{ posts: Post[] }>('/api/client/posts')
      .then((r) => setSold(r.posts.filter((p) => p.status === 'COMPLETED').length))
      .catch(() => setSold(0));
  }, [isClient]);

  useEffect(() => {
    if (!isClient) return;
    api<{ me: Me }>('/api/me')
      .then((r) => {
        if (r.me.kind === 'user') setAddresses((r.me.paymentAddresses ?? []).map(({ type, address }) => ({ type, address })));
      })
      .catch(() => undefined)
      .finally(() => setAddressesReady(true));
  }, [isClient]);

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    if (isClient) {
      const filled = addresses.filter((a) => a.type.trim() || a.address.trim());
      if (filled.some((a) => !a.type.trim() || !a.address.trim())) {
        toast({ title: 'Each payment address needs a type and an address.', tone: 'error' });
        return;
      }
    }
    setSaving(true);
    try {
      const paymentAddresses = addresses
        .filter((a) => a.type.trim() && a.address.trim())
        .map((a) => ({ type: a.type.trim(), address: a.address.trim() }));
      const r = await api<{ me: Me }>('/api/me', {
        method: 'PATCH',
        json: { name, email, ...(me.kind === 'user' ? { image } : {}), ...(isClient && addressesReady ? { paymentAddresses } : {}) },
      });
      setMe(r.me);
      if (r.me.kind === 'user' && r.me.paymentAddresses) {
        setAddresses(r.me.paymentAddresses.map(({ type, address }) => ({ type, address })));
      }
      toast({ title: 'Profile saved', tone: 'success' });
    } catch (err) {
      toast({ title: err instanceof ApiError ? err.message : 'Could not save.', tone: 'error' });
    } finally {
      setSaving(false);
    }
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwError(null);
    if (pw.newPassword !== pw.confirm) return setPwError('The new passwords do not match.');
    setPwBusy(true);
    try {
      await api('/api/me/password', { json: { currentPassword: pw.currentPassword, newPassword: pw.newPassword } });
      setPw({ currentPassword: '', newPassword: '', confirm: '' });
      toast({ title: 'Password changed', tone: 'success' });
    } catch (err) {
      setPwError(err instanceof ApiError ? err.message : 'Could not change password.');
    } finally {
      setPwBusy(false);
    }
  }

  // Clients see how many of their accounts are completed. Customers still see the admin-set counts.
  const counts =
    me.kind === 'user'
      ? me.role === 'CLIENT'
        ? [{ label: 'Sold', value: sold }]
        : [
            { label: 'Buy', value: me.b_counts ?? 0, hint: 'set by admin' },
            { label: 'Cart limit', value: me.cartLimit ?? 1, hint: 'set by admin' },
          ]
      : [];

  return (
    <>
      <PageTitle title="Profile" subtitle={me.kind === 'admin' ? 'Administrator account' : me.role === 'CLIENT' ? 'Client account' : 'Customer account'} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Your details" icon={<UserRound className="size-5" />} />
          <form onSubmit={saveProfile} className="space-y-4 p-5">
            {me.kind === 'user' && <ImageUpload value={image} onChange={setImage} label="Upload photo" round />}
            <Field label="Name" htmlFor="p-name"><Input id="p-name" required maxLength={100} value={name} onChange={(e) => setName(e.target.value)} /></Field>
            <Field label="Email" htmlFor="p-email"><Input id="p-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
            {counts.length > 0 && (
              <div className="grid grid-cols-2 gap-3">
                {counts.map((c) => (
                  <div key={c.label} className="rounded-xl border border-line bg-bg-base/60 p-3">
                    <p className="text-[11px] text-ink-lo">
                      {c.label}
                      {'hint' in c && c.hint && <span className="text-ink-lo/70"> ({c.hint})</span>}
                    </p>
                    <p className="mt-0.5 text-xl font-bold tabular-nums">{c.value}</p>
                  </div>
                ))}
              </div>
            )}
            {isClient && (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-ink-hi">Payment addresses</p>
                  <Button type="button" size="sm" variant="outline" disabled={!addressesReady} onClick={() => setAddresses((rows) => [...rows, { type: '', address: '' }])}>
                    <Plus /> Add
                  </Button>
                </div>
                {!addressesReady ? (
                  <p className="text-xs text-ink-lo">Loading payment addresses…</p>
                ) : addresses.length === 0 ? (
                  <p className="text-xs text-ink-lo">None yet. You can add more than one.</p>
                ) : (
                  addresses.map((row, i) => (
                    <div key={i} className="grid grid-cols-[minmax(0,8rem)_1fr_auto] gap-2">
                      <Input
                        aria-label="Payment type"
                        placeholder="Type"
                        maxLength={40}
                        value={row.type}
                        onChange={(e) => setAddresses((rows) => rows.map((r, n) => (n === i ? { ...r, type: e.target.value } : r)))}
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
            <Button type="submit" loading={saving}>Save profile</Button>
          </form>
        </Card>
        <Card>
          <CardHeader title="Change password" subtitle="Needs current password." icon={<KeyRound className="size-5" />} />
          <form onSubmit={changePassword} className="space-y-4 p-5">
            <Field label="Current password" htmlFor="pw-cur">
              <Input id="pw-cur" type="password" required autoComplete="current-password" value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} />
            </Field>
            <Field label="New password (at least 8 characters)" htmlFor="pw-new">
              <Input id="pw-new" type="password" required minLength={8} autoComplete="new-password" value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} />
            </Field>
            <Field label="Confirm new password" htmlFor="pw-confirm" error={pwError ?? undefined}>
              <Input id="pw-confirm" type="password" required minLength={8} autoComplete="new-password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} />
            </Field>
            <Button type="submit" variant="purple" loading={pwBusy}>Change password</Button>
          </form>
        </Card>
      </div>
    </>
  );
}
