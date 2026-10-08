'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import * as Menu from '@radix-ui/react-dropdown-menu';
import { Bell, CheckCheck } from 'lucide-react';
import { api } from '@/lib/client/api';
import type { Notification } from '@/lib/client/types';
import { cn, timeAgo } from '@/lib/utils';
import { useOnReconnect, useSocketEvent } from './providers/realtime';
import { useMe } from './providers/session';
import { useToast } from './providers/toast';

function targetFor(n: Notification, home: string) {
  if (n.conversationId) return `/chat?c=${n.conversationId}`;
  return home;
}

export function NotificationBell() {
  const router = useRouter();
  const toast = useToast();
  const { me } = useMe();
  const home = me.kind === 'admin' ? '/admin' : me.role === 'CLIENT' ? '/client' : '/cart';
  const [count, setCount] = useState(0);
  const [items, setItems] = useState<Notification[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const refreshCount = useCallback(() => {
    api<{ count: number }>('/api/notifications/unread-count').then((r) => setCount(r.count)).catch(() => undefined);
  }, []);
  useEffect(refreshCount, [refreshCount]);
  useOnReconnect(() => {
    refreshCount();
    setLoaded(false);
  });

  async function load(more = false) {
    const r = await api<{ items: Notification[]; nextCursor: string | null }>(
      `/api/notifications${more && cursor ? `?cursor=${cursor}` : ''}`,
    );
    setItems((prev) => (more ? [...prev, ...r.items] : r.items));
    setCursor(r.nextCursor);
    setLoaded(true);
  }

  async function open(n: Notification) {
    if (!n.readAt) {
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x)));
      setCount((c) => Math.max(0, c - 1));
      await api(`/api/notifications/${n.id}/read`, { method: 'POST' }).catch(() => undefined);
    }
    router.push(targetFor(n, home));
  }

  useSocketEvent<{ notification: Notification }>('notification:new', ({ notification: n }) => {
    setCount((c) => c + 1);
    setItems((prev) => (loaded ? [n, ...prev] : prev));
    toast({ title: n.title, body: n.body ?? undefined, onClick: () => open(n) });
    if (typeof window !== 'undefined' && 'Notification' in window && document.hidden && Notification.permission === 'granted') {
      const bn = new Notification(n.title, { body: n.body ?? undefined, tag: n.id });
      bn.onclick = () => {
        window.focus();
        void open(n);
      };
    }
  });

  async function readAll() {
    await api('/api/notifications/read-all', { method: 'POST' });
    setCount(0);
    setItems((prev) => prev.map((x) => ({ ...x, readAt: x.readAt ?? new Date().toISOString() })));
  }

  return (
    <Menu.Root
      onOpenChange={(o) => {
        if (!o) return;
        void load();
        if ('Notification' in window && Notification.permission === 'default') void Notification.requestPermission();
      }}
    >
      <Menu.Trigger className="relative rounded-xl p-2 text-ink-mid hover:bg-bg-elev hover:text-ink-hi" aria-label={`Notifications (${count} unread)`}>
        <Bell className="size-5" />
        {count > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex min-w-[18px] items-center justify-center rounded-full bg-state-err px-1 text-[10px] font-bold text-white">
            {count > 99 ? '99+' : count}
          </span>
        )}
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content align="end" sideOffset={8} className="panel z-50 w-[min(380px,calc(100vw-1.5rem))] overflow-hidden p-0">
          <div className="flex items-center justify-between border-b border-line/70 px-4 py-3">
            <p className="text-sm font-semibold">Notifications</p>
            <button onClick={readAll} className="flex items-center gap-1 text-xs text-brand-mint hover:underline">
              <CheckCheck className="size-3.5" /> Mark all read
            </button>
          </div>
          <div className="max-h-[420px] overflow-y-auto">
            {loaded && items.length === 0 && <p className="px-4 py-10 text-center text-sm text-ink-lo">You&apos;re all caught up.</p>}
            {items.map((n) => (
              <Menu.Item
                key={n.id}
                onSelect={() => void open(n)}
                className={cn(
                  'flex cursor-pointer gap-3 border-b border-line/40 px-4 py-3 outline-none data-[highlighted]:bg-bg-elev',
                  !n.readAt && 'bg-brand-purple/5',
                )}
              >
                <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', n.readAt ? 'bg-transparent' : 'bg-brand-mint')} />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink-hi">{n.title}</p>
                  {n.body && <p className="mt-0.5 truncate text-xs text-ink-mid">{n.body}</p>}
                  <p className="mt-1 text-[11px] text-ink-lo">{timeAgo(n.createdAt)}</p>
                </div>
              </Menu.Item>
            ))}
            {cursor && (
              <button onClick={(e) => { e.preventDefault(); void load(true); }} className="w-full py-3 text-xs text-brand-mint hover:bg-bg-elev">
                Load more
              </button>
            )}
          </div>
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}
