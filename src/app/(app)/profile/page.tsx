'use client';

import { useState } from 'react';
import { KeyRound, UserRound } from 'lucide-react';
import { PageTitle } from '@/components/app-shell';
import { ImageUpload } from '@/components/post-bits';
import { useMe } from '@/components/providers/session';
import { useToast } from '@/components/providers/toast';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, Field, Input } from '@/components/ui/primitives';
import { api, ApiError } from '@/lib/client/api';
import type { ImageInfo, Me } from '@/lib/client/types';

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

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const r = await api<{ me: Me }>('/api/me', { method: 'PATCH', json: { name, email, ...(me.kind === 'user' ? { image } : {}) } });
      setMe(r.me);
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

  // Counts are role-specific and read-only here: Clients see s_counts, Customers see b_counts.
  const counts =
    me.kind === 'user'
      ? me.role === 'CLIENT'
        ? [{ label: 's_counts', value: me.s_counts ?? 0 }]
        : [
            { label: 'b_counts', value: me.b_counts ?? 0 },
            { label: 'Cart limit', value: me.cartLimit ?? 1 },
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
                    <p className="text-[11px] text-ink-lo">{c.label} <span className="text-ink-lo/70">(set by admin)</span></p>
                    <p className="mt-0.5 text-xl font-bold tabular-nums">{c.value}</p>
                  </div>
                ))}
              </div>
            )}
            <Button type="submit" loading={saving}>Save profile</Button>
          </form>
        </Card>
        <Card>
          <CardHeader title="Change password" subtitle="Your current password is required." icon={<KeyRound className="size-5" />} />
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
