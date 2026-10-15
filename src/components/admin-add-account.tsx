'use client';

import { useEffect, useState } from 'react';
import { ChevronDown, Plus } from 'lucide-react';
import { ImageUpload } from '@/components/post-bits';
import { useToast } from '@/components/providers/toast';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Field, Input } from '@/components/ui/primitives';
import { ACCOUNT_KIND_LABEL, type AccountKind } from '@/lib/account-kinds';
import { api, ApiError } from '@/lib/client/api';
import type { ImageInfo, Post, UserRow } from '@/lib/client/types';

// What the main field holds for each account type.
const TITLE_FIELD: Record<AccountKind, { label: string; placeholder: string }> = {
  LINKEDIN: { label: 'Profile link', placeholder: 'https://linkedin.com/in/…' },
  GV: { label: 'Phone number', placeholder: '+1(919) 483-3934' },
  GMAIL: { label: 'Email', placeholder: 'name@gmail.com' },
  WHATSAPP: { label: 'Phone number', placeholder: '+1 555 123 4567' },
  TELEGRAM: { label: 'Username or link', placeholder: '@username' },
};

const empty = { clientId: '', title: '', name: '', connects: '', price: '' };

/** "Add account" button + form. The account is created accepted and goes live at once. */
export function AdminAddAccount({ kind, onCreated }: { kind: AccountKind; onCreated: (post: Post) => void }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [sellers, setSellers] = useState<UserRow[] | null>(null);
  const [form, setForm] = useState(empty);
  const [image, setImage] = useState<ImageInfo | null>(null);
  const [detailImage, setDetailImage] = useState<ImageInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const linkedIn = kind === 'LINKEDIN';
  const field = TITLE_FIELD[kind];

  useEffect(() => {
    if (!open) return;
    setForm(empty);
    setImage(null);
    setDetailImage(null);
    setError(null);
    api<{ users: UserRow[] }>('/api/admin/users?role=CLIENT')
      .then((r) => setSellers(r.users.filter((u) => !u.isBlocked && (u.sellerKinds ?? ['LINKEDIN']).includes(kind))))
      .catch(() => setSellers([]));
  }, [open, kind]);

  const set = (k: keyof typeof empty) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ post: Post }>('/api/admin/posts', {
        json: {
          clientId: form.clientId,
          kind,
          title: form.title,
          price: form.price,
          image,
          ...(linkedIn ? { name: form.name, connects: form.connects || 0, detailImage } : {}),
        },
      });
      onCreated(r.post);
      toast({ title: 'Account added', body: 'It is accepted and live for customers.', tone: 'success' });
      setOpen(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not add the account.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus /> Add account
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title={`Add ${ACCOUNT_KIND_LABEL[kind]} account`} description="It is accepted straight away and goes live for customers." className="max-w-lg">
          <form onSubmit={submit} className="space-y-4">
            <Field label="Seller" htmlFor="add-seller">
              <label className="relative block">
                <select id="add-seller" required value={form.clientId} onChange={set('clientId')} className="field cursor-pointer appearance-none pr-8">
                  <option value="" disabled>
                    {sellers === null ? 'Loading sellers…' : sellers.length === 0 ? `No seller sells ${ACCOUNT_KIND_LABEL[kind]}` : 'Choose a seller'}
                  </option>
                  {sellers?.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} · {s.email}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-ink-lo" />
              </label>
            </Field>
            <Field label={field.label} htmlFor="add-title">
              <Input id="add-title" required maxLength={300} placeholder={field.placeholder} value={form.title} onChange={set('title')} />
            </Field>
            {linkedIn && (
              <Field label="Name" htmlFor="add-name">
                <Input id="add-name" required maxLength={120} placeholder="Robert George" value={form.name} onChange={set('name')} />
              </Field>
            )}
            <div className={linkedIn ? 'grid grid-cols-2 gap-3' : undefined}>
              {linkedIn && (
                <Field label="Connects" htmlFor="add-connects">
                  <Input id="add-connects" type="number" min={0} step={1} placeholder="0" value={form.connects} onChange={set('connects')} />
                </Field>
              )}
              <Field label="Price ($)" htmlFor="add-price">
                <Input id="add-price" type="number" required min={0} step="0.01" placeholder="50.00" value={form.price} onChange={set('price')} />
              </Field>
            </div>
            <div className={linkedIn ? 'grid gap-4 sm:grid-cols-2' : undefined}>
              <div>
                <p className="mb-2 text-sm font-medium text-ink-hi">
                  Photo <span className="font-normal text-ink-lo">(optional)</span>
                </p>
                <ImageUpload value={image} onChange={setImage} label="Add photo" />
              </div>
              {linkedIn && (
                <div>
                  <p className="mb-2 text-sm font-medium text-ink-hi">
                    Detail image <span className="font-normal text-ink-lo">(optional)</span>
                  </p>
                  <ImageUpload value={detailImage} onChange={setDetailImage} label="Add detail image" />
                </div>
              )}
            </div>
            {error && <p className="rounded-xl border border-state-err/40 bg-state-err/10 px-3 py-2 text-sm text-state-err">{error}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={busy}>
                Cancel
              </Button>
              <Button type="submit" loading={busy} disabled={!sellers || sellers.length === 0}>
                <Plus /> Add account
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Edit a published or completed account: link, name, connects, price and images. */
export function AdminEditAccount({ post, onSaved, onClose }: { post: Post | null; onSaved: (post: Post) => void; onClose: () => void }) {
  const toast = useToast();
  const [form, setForm] = useState({ title: '', name: '', connects: '', price: '' });
  const [image, setImage] = useState<ImageInfo | null>(null);
  const [detailImage, setDetailImage] = useState<ImageInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const kind = post?.kind ?? 'LINKEDIN';
  const linkedIn = kind === 'LINKEDIN';

  useEffect(() => {
    if (!post) return;
    setForm({ title: post.title, name: post.name ?? '', connects: String(post.connects), price: post.price !== null ? post.price.toFixed(2) : '' });
    setImage(post.image);
    setDetailImage(post.detailImage);
    setError(null);
  }, [post]);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!post) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ post: Post }>(`/api/admin/posts/${post.id}`, {
        method: 'PATCH',
        json: {
          title: form.title.trim(),
          price: Number(form.price),
          image,
          ...(linkedIn ? { name: form.name.trim(), connects: Number(form.connects || 0), detailImage } : {}),
        },
      });
      onSaved(r.post);
      toast({ title: 'Account updated', tone: 'success' });
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={!!post} onOpenChange={(o) => !o && onClose()}>
      {post && (
        <DialogContent title={`Edit ${ACCOUNT_KIND_LABEL[kind]} account`} description={`Seller: ${post.clientName}`} className="max-w-lg">
          <form onSubmit={submit} className="space-y-4">
            <Field label={TITLE_FIELD[kind].label} htmlFor="edit-title">
              <Input id="edit-title" required maxLength={300} value={form.title} onChange={set('title')} />
            </Field>
            {linkedIn && (
              <Field label="Name" htmlFor="edit-name">
                <Input id="edit-name" required maxLength={120} value={form.name} onChange={set('name')} />
              </Field>
            )}
            <div className={linkedIn ? 'grid grid-cols-2 gap-3' : undefined}>
              {linkedIn && (
                <Field label="Connects" htmlFor="edit-connects">
                  <Input id="edit-connects" type="number" min={0} step={1} value={form.connects} onChange={set('connects')} />
                </Field>
              )}
              <Field label="Price ($)" htmlFor="edit-price">
                <Input id="edit-price" type="number" required min={0} step="0.01" value={form.price} onChange={set('price')} />
              </Field>
            </div>
            <div className={linkedIn ? 'grid gap-4 sm:grid-cols-2' : undefined}>
              <div>
                <p className="mb-2 text-sm font-medium text-ink-hi">Photo</p>
                <ImageUpload value={image} onChange={setImage} label="Add photo" />
              </div>
              {linkedIn && (
                <div>
                  <p className="mb-2 text-sm font-medium text-ink-hi">Detail image</p>
                  <ImageUpload value={detailImage} onChange={setDetailImage} label="Add detail image" />
                </div>
              )}
            </div>
            {error && <p className="rounded-xl border border-state-err/40 bg-state-err/10 px-3 py-2 text-sm text-state-err">{error}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
                Cancel
              </Button>
              <Button type="submit" loading={busy}>
                Save
              </Button>
            </div>
          </form>
        </DialogContent>
      )}
    </Dialog>
  );
}
