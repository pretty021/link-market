'use client';

import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { useToast } from '@/components/providers/toast';
import { Button } from '@/components/ui/button';
import { api, ApiError } from '@/lib/client/api';
import type { Post } from '@/lib/client/types';

/** One confirm, then the seller's own account is removed. Hidden while a buyer is holding it. */
export function DeleteAccountButton({
  post,
  onDeleted,
  compact = false,
}: {
  post: Post;
  onDeleted: (id: string) => void;
  compact?: boolean;
}) {
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
    <Button
      type="button"
      size={compact ? 'icon' : 'sm'}
      variant="danger"
      className={compact ? 'size-8' : undefined}
      onClick={() => void remove()}
      loading={busy}
      aria-label="Delete account"
      title="Delete"
    >
      {!busy && <Trash2 />}
      {!compact && 'Delete'}
    </Button>
  );
}
