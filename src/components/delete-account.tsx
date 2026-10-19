'use client';

import { useState } from 'react';
import { Loader2, Trash2 } from 'lucide-react';
import { useToast } from '@/components/providers/toast';
import { api, ApiError } from '@/lib/client/api';
import type { Post } from '@/lib/client/types';

/** One confirm, then the seller's own account is removed. Hidden while a buyer is holding it. */
export function DeleteAccountButton({ post, onDeleted }: { post: Post; onDeleted: (id: string) => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  if (post.status === 'PROGRESSING') return null;

  async function remove() {
    const label = post.name?.trim() || post.title;
    if (!window.confirm(`Delete "${label}"? This cannot be undone.`)) return;
    setBusy(true);
    try {
      await api(`/api/client/posts/${post.id}`, { method: 'DELETE' });
      onDeleted(post.id);
      toast({ title: 'Account deleted', tone: 'success' });
    } catch (e) {
      toast({ title: e instanceof ApiError ? e.message : 'Could not delete.', tone: 'error' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void remove()}
      disabled={busy}
      aria-label="Delete account"
      title="Delete"
      aria-busy={busy || undefined}
      className="inline-flex size-7 items-center justify-center text-state-err transition-colors hover:text-state-err/70 disabled:opacity-45"
    >
      {busy ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
    </button>
  );
}
