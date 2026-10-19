'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { List, Table2 } from 'lucide-react';
import { AccountOwnerActions } from '@/components/edit-account';
import { Countdown, PostImage, PostTitle, StatusBadge } from '@/components/post-bits';
import { Badge } from '@/components/ui/primitives';
import { DEFAULT_ACCOUNT_IMAGE, coverClass, coverSrc } from '@/lib/account-kinds';
import type { Post } from '@/lib/client/types';
import { cn, formatPrice } from '@/lib/utils';

export type AccountView = 'list' | 'table';

/** List / Table choice, remembered per browser (separately for Clients and Customers). */
export function useAccountView(storageKey = 'client-account-view'): [AccountView, (next: AccountView) => void] {
  const [view, setView] = useState<AccountView>('list');
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(storageKey);
      if (saved === 'list' || saved === 'table') setView(saved);
    } catch {
      // Storage blocked: start with the list.
    }
  }, [storageKey]);
  function update(next: AccountView) {
    setView(next);
    try {
      window.localStorage.setItem(storageKey, next);
    } catch {
      // Remembering the choice is only a convenience.
    }
  }
  return [view, update];
}

export function AccountViewToggle({ value, onChange }: { value: AccountView; onChange: (next: AccountView) => void }) {
  const item = (mode: AccountView, label: string, icon: ReactNode) => (
    <button
      type="button"
      aria-pressed={value === mode}
      onClick={() => onChange(mode)}
      className={cn(
        'inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-semibold transition',
        value === mode ? 'bg-primary text-on-primary' : 'text-ink-mid hover:text-ink-hi',
      )}
    >
      {icon}
      {label}
    </button>
  );
  return (
    <div className="inline-flex shrink-0 rounded-full border border-line bg-bg-base p-0.5" role="group" aria-label="Account layout">
      {item('list', 'List', <List className="size-3.5" />)}
      {item('table', 'Table', <Table2 className="size-3.5" />)}
    </div>
  );
}

export function AccountTable({
  posts,
  showConnects,
  flash,
  onExpired,
  onDeleted,
  onUpdated,
}: {
  posts: Post[];
  showConnects: boolean;
  flash: Set<string>;
  onExpired: () => void;
  /** When set, the seller can edit and delete their own account. */
  onDeleted?: (id: string) => void;
  onUpdated?: (post: Post) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="rtable w-full min-w-[720px] text-sm">
        <thead className="border-b border-line/70 text-left text-xs text-ink-lo">
          <tr>
            <th className="px-4 py-3 font-medium">Account</th>
            {showConnects && <th className="px-4 py-3 font-medium">Connects</th>}
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 font-medium">Updated</th>
            <th className="px-4 py-3 font-medium">Holder</th>
            <th className="px-4 py-3 text-right font-medium">Price</th>
            {onDeleted && <th className="px-4 py-3 text-right font-medium">Actions</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-line/40">
          {posts.map((post) => {
            const when = new Date(post.updatedAt);
            const linkedIn = (post.kind ?? 'LINKEDIN') === 'LINKEDIN';
            return (
              <tr key={post.id} className={cn('hover:bg-bg-elev/40', flash.has(post.id) && 'bg-brand-mint/10')}>
                <td className="rt-main px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="size-8 shrink-0 overflow-hidden rounded-md bg-bg-elev">
                      {post.image?.url ? (
                        <PostImage image={post.image} title={post.title} />
                      ) : linkedIn ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={DEFAULT_ACCOUNT_IMAGE} alt={post.title} className="size-full object-cover" />
                      ) : (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={coverSrc(null, post.kind)} alt={post.title} className={coverClass(null, post.kind, 'p-0.5')} />
                      )}
                    </div>
                    <PostTitle post={post} className="max-w-[240px]" headingClassName="font-medium" />
                  </div>
                </td>
                {showConnects && <td data-label="Connects" className="px-4 py-3 tabular-nums text-ink-mid">{post.connects}</td>}
                <td data-label="Status" className="px-4 py-3">
                  <div className="flex flex-wrap items-center justify-end gap-1.5 md:justify-start">
                    <StatusBadge status={post.status} clientChecking={!!post.progressingPausedAt} />
                    {post.approval ? <Badge tone="mint">Accepted</Badge> : <Badge tone="amber">Awaiting admin</Badge>}
                    {post.approval && !post.visible && <Badge tone="slate">Hidden</Badge>}
                  </div>
                </td>
                <td data-label="Updated" className="px-4 py-3">
                  <time dateTime={when.toISOString()} className="block text-[11px] leading-tight tabular-nums text-ink-lo">
                    <span className="block font-semibold text-ink-mid">{when.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
                    <span className="mt-0.5 block">{when.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                  </time>
                </td>
                <td data-label="Buyer" className="px-4 py-3 text-ink-mid">
                  {post.status === 'PROGRESSING' ? (
                    <div className="space-y-1">
                      <p>{post.holderName ?? '-'}</p>
                      <Countdown expiresAt={post.progressingExpiresAt} paused={!!post.progressingPausedAt} onDone={onExpired} />
                    </div>
                  ) : (
                    post.holderName ?? '-'
                  )}
                </td>
                <td data-label="Price" className="px-4 py-3 text-right font-semibold tabular-nums">{formatPrice(post.price)}</td>
                {onDeleted && (
                  <td className="rt-actions px-4 py-3 text-right">
                    {post.status === 'PROGRESSING' ? (
                      <span className="text-ink-lo">-</span>
                    ) : (
                      <AccountOwnerActions post={post} onUpdated={onUpdated} onDeleted={onDeleted} compact />
                    )}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
