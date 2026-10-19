'use client';

import { useEffect, useState } from 'react';
import { Pencil } from 'lucide-react';
import { DeleteAccountButton } from '@/components/delete-account';
import { ImageUpload } from '@/components/post-bits';
import { useToast } from '@/components/providers/toast';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Field, Input } from '@/components/ui/primitives';
import { ACCOUNT_KIND_LABEL, kindLogoSrc, type AccountKind } from '@/lib/account-kinds';
import { api, ApiError } from '@/lib/client/api';
import type { ImageInfo, Post } from '@/lib/client/types';

const TITLE_FIELD: Record<AccountKind, { label: string; placeholder: string }> = {
  LINKEDIN: { label: 'Profile link', placeholder: 'https://linkedin.com/in/…' },
  GV: { label: 'Phone number', placeholder: '+1(919) 483-3934' },
  GMAIL: { label: 'Email', placeholder: 'name@gmail.com' },
  WHATSAPP: { label: 'Phone number', placeholder: '+1 555 123 4567' },
  TELEGRAM: { label: 'Username or link', placeholder: '@username' },
};

/** Edit and delete for a seller's own account. Hidden while a buyer is holding it. */
export function AccountOwnerActions({
  post,
  onUpdated,
  onDeleted,
}: {
  post: Post;
  onUpdated?: (post: Post) => void;
  onDeleted: (id: string) => void;
}) {
  if (post.status === 'PROGRESSING') return null;
  return (
    <div className="flex items-center justify-end gap-0.5">
      {onUpdated && <EditAccountButton post={post} onUpdated={onUpdated} />}
      <DeleteAccountButton post={post} onDeleted={onDeleted} />
    </div>
  );
}

function EditAccountButton({ post, onUpdated }: { post: Post; onUpdated: (post: Post) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Edit account"
        title="Edit"
        className="inline-flex size-7 items-center justify-center text-ink-mid transition-colors hover:text-ink-hi"
      >
        <Pencil className="size-4" />
      </button>
      <EditAccountDialog
        post={open ? post : null}
        onClose={() => setOpen(false)}
        onSaved={(next) => {
          onUpdated(next);
          setOpen(false);
        }}
      />
    </>
  );
}

function EditAccountDialog({
  post,
  onClose,
  onSaved,
}: {
  post: Post | null;
  onClose: () => void;
  onSaved: (post: Post) => void;
}) {
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
    setForm({
      title: post.title,
      name: post.name ?? '',
      connects: String(post.connects),
      price: post.price !== null ? post.price.toFixed(2) : '',
    });
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
      const r = await api<{ post: Post; changed: boolean }>(`/api/client/posts/${post.id}`, {
        method: 'PATCH',
        json: {
          title: form.title.trim(),
          price: Number(form.price),
          image,
          ...(linkedIn ? { name: form.name.trim(), connects: Number(form.connects || 0), detailImage } : {}),
        },
      });
      onSaved(r.post);
      toast({ title: r.changed ? 'Account updated' : 'No changes', tone: r.changed ? 'success' : undefined });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={!!post} onOpenChange={(o) => !o && onClose()}>
      {post && (
        <DialogContent title={`Edit ${ACCOUNT_KIND_LABEL[kind]} account`} className="max-w-lg">
          <form onSubmit={submit} className="space-y-4">
            <Field label={TITLE_FIELD[kind].label} htmlFor="client-edit-title">
              <Input id="client-edit-title" required maxLength={300} placeholder={TITLE_FIELD[kind].placeholder} value={form.title} onChange={set('title')} />
            </Field>
            {linkedIn && (
              <Field label="Name" htmlFor="client-edit-name">
                <Input id="client-edit-name" required maxLength={120} value={form.name} onChange={set('name')} />
              </Field>
            )}
            <div className={linkedIn ? 'grid grid-cols-2 gap-3' : undefined}>
              {linkedIn && (
                <Field label="Connects" htmlFor="client-edit-connects">
                  <Input id="client-edit-connects" type="number" min={0} step={1} value={form.connects} onChange={set('connects')} />
                </Field>
              )}
              <Field label="Price ($)" htmlFor="client-edit-price">
                <Input id="client-edit-price" type="number" required min={0} step="0.01" value={form.price} onChange={set('price')} />
              </Field>
            </div>
            <div className={linkedIn ? 'grid gap-4 sm:grid-cols-2' : undefined}>
              <div>
                <p className="mb-2 text-sm font-medium text-ink-hi">Photo</p>
                <ImageUpload value={image} onChange={setImage} label="Add photo" placeholderSrc={kindLogoSrc(kind) ?? undefined} />
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
