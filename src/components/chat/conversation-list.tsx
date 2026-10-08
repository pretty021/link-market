'use client';

import { Search } from 'lucide-react';
import { Avatar, Badge, Empty, Input, Spinner } from '@/components/ui/primitives';
import { useMe } from '@/components/providers/session';
import type { Conversation } from '@/lib/client/types';
import { cn, timeAgo } from '@/lib/utils';

export function ConversationList({
  items,
  selected,
  onSelect,
  q,
  onQ,
  showAllParticipants,
}: {
  items: Conversation[] | null;
  selected: string | null;
  onSelect: (id: string) => void;
  q: string;
  onQ: (q: string) => void;
  showAllParticipants?: boolean;
}) {
  const { me } = useMe();
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-line/70 p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-lo" />
          <Input value={q} onChange={(e) => onQ(e.target.value)} placeholder="Search name or email" className="pl-9" />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {items === null && <div className="flex justify-center py-10"><Spinner /></div>}
        {items?.length === 0 && <Empty title="No conversations yet" />}
        {items?.map((c) => {
          const other = c.participants.find((p) => p.id !== me.id) ?? c.participants[0];
          const title = showAllParticipants ? c.participants.map((p) => p.name).join(' ↔ ') : c.title;
          return (
            <button
              key={c.id}
              onClick={() => onSelect(c.id)}
              className={cn(
                'flex w-full items-start gap-3 border-b border-line/40 px-4 py-3 text-left transition hover:bg-bg-elev/70',
                selected === c.id && 'bg-bg-elev',
              )}
            >
              <Avatar name={other?.name} src={other?.image?.url} size={40} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-sm font-semibold">{title}</p>
                  <span className="shrink-0 text-[11px] text-ink-lo">{timeAgo(c.lastMessageAt)}</span>
                </div>
                <div className="mt-0.5 flex items-center gap-1.5">
                  {c.type === 'DEAL' ? <Badge tone="purple">Deal</Badge> : <Badge tone="mint">Support</Badge>}
                  {c.post && <span className="truncate text-xs text-ink-mid">{c.post.title}</span>}
                </div>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <p className="truncate text-xs text-ink-lo">{c.lastMessage?.body ?? 'No messages yet'}</p>
                  {c.unread > 0 && (
                    <span className="flex min-w-[20px] shrink-0 items-center justify-center rounded-full bg-brand-mint px-1.5 text-[11px] font-bold text-bg-deep">
                      {c.unread}
                    </span>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
