'use client';

import Link from 'next/link';
import { Eye, MessageCircle, ShoppingCart } from 'lucide-react';
import { AccountThumb, UpdatedStamp } from '@/components/linkedin-card';
import { Countdown, StatusBadge, postHref } from '@/components/post-bits';
import { Button } from '@/components/ui/button';
import { Avatar } from '@/components/ui/primitives';
import type { AccountKind } from '@/lib/account-kinds';
import type { Post } from '@/lib/client/types';
import { cn, formatPrice } from '@/lib/utils';

/** Customer "Table" layout: one row per account, with the same cart actions as the cards. */
export function CustomerAccountTable({
  posts,
  kind,
  meId,
  cart,
  busy,
  onOpen,
  onToggleCart,
  onExpired,
}: {
  posts: Post[];
  kind: AccountKind;
  meId: string;
  cart: Set<string>;
  busy: string | null;
  onOpen: (p: Post) => void;
  onToggleCart: (p: Post) => void;
  onExpired: () => void;
}) {
  const linkedIn = kind === 'LINKEDIN';
  // Bought accounts aren't for sale any more, so "viewing" means nothing there.
  const showViewing = posts.some((p) => p.status !== 'COMPLETED');
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[820px] text-sm">
        <thead className="border-b border-line/70 text-left text-xs text-ink-lo">
          <tr>
            <th className="px-4 py-3 font-medium">Account</th>
            {linkedIn && <th className="px-4 py-3 font-medium">Connects</th>}
            <th className="px-4 py-3 font-medium">Seller</th>
            <th className="px-4 py-3 font-medium">Status</th>
            {showViewing && <th className="px-4 py-3 font-medium">Viewing</th>}
            <th className="px-4 py-3 font-medium">Updated</th>
            <th className="px-4 py-3 text-right font-medium">Price</th>
            <th className="px-4 py-3" aria-label="Actions" />
          </tr>
        </thead>
        <tbody className="divide-y divide-line/40">
          {posts.map((post) => {
            const mine = post.holderId === meId;
            const done = post.status === 'COMPLETED';
            const inCart = cart.has(post.id);
            const heading = post.name?.trim() || post.title;
            const href = postHref(post.title);
            return (
              <tr key={post.id} className={cn('hover:bg-bg-elev/40', done && 'bg-state-ok/10')}>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <AccountThumb name={heading} photo={post.image?.url} className="size-10 rounded-xl text-xs [&>span]:text-sm" />
                    <div className="min-w-0 max-w-[260px]">
                      {post.detailImage ? (
                        <button type="button" onClick={() => onOpen(post)} className="block truncate text-left font-semibold hover:text-brand-mint">
                          {heading}
                        </button>
                      ) : (
                        <p className="truncate font-semibold">{heading}</p>
                      )}
                      {post.name?.trim() && href && (
                        <a href={href} target="_blank" rel="noopener noreferrer nofollow" className="block truncate text-xs text-brand-mint hover:underline">
                          {post.title.replace(/^https?:\/\/(www\.)?/i, '')}
                        </a>
                      )}
                    </div>
                  </div>
                </td>
                {linkedIn && <td className="px-4 py-3 tabular-nums text-ink-mid">{post.connects}</td>}
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Avatar name={post.clientName} src={post.clientImage?.url} size={28} online={post.clientOnline} />
                    <span className="truncate text-ink-mid">{post.clientName}</span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <StatusBadge status={post.status} mine={mine} clientChecking={mine && !!post.progressingPausedAt} />
                    {post.status === 'PROGRESSING' && mine && (
                      <Countdown expiresAt={post.progressingExpiresAt} paused={!!post.progressingPausedAt} onDone={onExpired} />
                    )}
                  </div>
                </td>
                {showViewing && (
                  <td className="px-4 py-3 text-ink-mid">
                    {!done && (
                      <span className="inline-flex items-center gap-1.5">
                        <Eye className="size-4" /> {post.viewers}
                      </span>
                    )}
                  </td>
                )}
                <td className="px-4 py-3">
                  <UpdatedStamp when={new Date(post.updatedAt)} />
                </td>
                <td className="px-4 py-3 text-right font-bold tabular-nums">{formatPrice(post.price)}</td>
                <td className="px-4 py-3 text-right">
                  {done ? (
                    <Button asChild size="sm" variant="outline" className="size-9 rounded-xl px-0">
                      <Link href="/chat" aria-label="Messages" title="Messages">
                        <MessageCircle />
                      </Link>
                    </Button>
                  ) : mine ? (
                    <Button asChild size="sm" variant="purple" className="rounded-xl">
                      <Link href="/cart">Open in cart</Link>
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant={inCart ? 'outline' : 'primary'}
                      loading={busy === post.id}
                      disabled={!inCart && post.status !== 'PUBLISHED'}
                      onClick={() => onToggleCart(post)}
                      className={cn('rounded-xl', inCart || post.status === 'PROGRESSING' ? 'px-3' : 'size-9 px-0')}
                      aria-label={inCart ? 'Remove from cart' : 'Add to cart'}
                      title={inCart ? 'Remove from cart' : 'Add to cart'}
                    >
                      <ShoppingCart /> {inCart ? 'Remove' : post.status === 'PROGRESSING' ? 'In progress' : null}
                    </Button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
