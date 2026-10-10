'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import * as Menu from '@radix-ui/react-dropdown-menu';
import { LogOut, LifeBuoy, ShoppingCart, User } from 'lucide-react';
import { api, ApiError } from '@/lib/client/api';
import { homePath } from '@/lib/home';
import type { Me, Post } from '@/lib/client/types';
import { cn } from '@/lib/utils';
import { Avatar } from './ui/primitives';
import { Logo } from './logo';
import { ThemeToggle } from './theme-toggle';
import { NotificationBell } from './notification-bell';
import { RealtimeProvider, useSocket, useSocketEvent } from './providers/realtime';
import { SessionProvider, useMe } from './providers/session';
import { ToastProvider, useToast } from './providers/toast';

type NavItem = { href: string; label: string };

function navFor(me: Me): NavItem[] {
  if (me.kind === 'admin') {
    return [
      { href: '/admin', label: 'Requests' },
      { href: '/admin/posts', label: 'Links' },
      { href: '/admin/clients', label: 'Clients' },
      { href: '/admin/customers', label: 'Customers' },
      { href: '/chat', label: 'Messages' },
      { href: '/admin/history', label: 'All chats' },
    ];
  }
  if (me.role === 'CLIENT') {
    return [
      { href: '/client', label: 'Links' },
      { href: '/client/analysis', label: 'Analysis' },
      { href: '/chat', label: 'Messages' },
    ];
  }
  return [
    { href: '/feed', label: 'Marketplace' },
    { href: '/analysis', label: 'Analysis' },
    { href: '/cart', label: 'Cart' },
    { href: '/chat', label: 'Messages' },
  ];
}

function SupportButton() {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function open() {
    setBusy(true);
    try {
      const r = await api<{ conversationId: string }>('/api/conversations/support', { method: 'POST' });
      router.push(`/chat?c=${r.conversationId}`);
    } catch (e) {
      toast({ title: e instanceof ApiError ? e.message : 'Could not open support.', tone: 'error' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={open}
      disabled={busy}
      className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium text-ink-mid hover:bg-bg-elev hover:text-ink-hi disabled:opacity-60"
      title="Ask the support team"
    >
      <LifeBuoy className="size-4" />
      <span className="hidden sm:inline">Support</span>
    </button>
  );
}

function CartButton() {
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    api<{ count: number }>('/api/cart').then((r) => setCount(r.count)).catch(() => undefined);
  }, []);
  useSocketEvent<{ count: number }>('cart:updated', (p) => setCount(p.count));
  return (
    <Link href="/cart" className="relative rounded-xl p-2 text-ink-mid hover:bg-bg-elev hover:text-ink-hi" aria-label="Cart">
      <ShoppingCart className="size-5" />
      {!!count && (
        <span className="absolute -right-0.5 -top-0.5 flex min-w-[18px] items-center justify-center rounded-full bg-brand-mint px-1 text-[10px] font-bold text-on-mint">
          {count}
        </span>
      )}
    </Link>
  );
}

function GlobalListeners() {
  const router = useRouter();
  const toast = useToast();
  const { me } = useMe();
  const alerted = useRef(new Set<string>());

  // Client: a Customer confirmed one of My Accounts. Keyed by progressingAt so later
  // post:updated events for the same hold (e.g. a price edit) don't alert again.
  useSocketEvent<{ post: Post }>('post:updated', ({ post }) => {
    if (me.kind !== 'user' || me.role !== 'CLIENT' || post.clientId !== me.id) return;
    if (post.status !== 'PROGRESSING' || !post.progressingAt) return;
    const key = `${post.id}:${post.progressingAt}`;
    if (alerted.current.has(key)) return;
    alerted.current.add(key);
    const title = `${post.holderName ?? 'A customer'} confirmed your link`;
    const body = `"${post.title}" is in progress. The 5-minute countdown has started.`;
    toast({ title, body, tone: 'success', onClick: () => router.push('/client') });
    if ('Notification' in window && document.hidden && Notification.permission === 'granted') {
      const n = new Notification(title, { body, tag: key });
      n.onclick = () => {
        window.focus();
        router.push('/client');
      };
    }
  });

  // Client clicked "Checked": both sides jump to the deal chat, wherever they are.
  useSocketEvent<{ conversationId: string }>('check:checked', (p) => {
    toast({ title: 'Checked - completed', body: 'Opening your deal chat.', tone: 'success' });
    router.push(`/chat?c=${p.conversationId}`);
  });
  return null;
}

function ConnectionDot() {
  const { connected } = useSocket();
  return (
    <span
      title={connected ? 'Live' : 'Reconnecting...'}
      className={cn('hidden size-2 rounded-full sm:inline-block', connected ? 'bg-state-ok' : 'bg-state-warn')}
    />
  );
}

function UserMenu() {
  const { me } = useMe();
  const router = useRouter();
  const name = me.kind === 'admin' ? (me.name ?? 'Admin') : me.name;
  const role = me.kind === 'admin' ? 'Admin' : me.role === 'CLIENT' ? 'Client' : 'Customer';

  async function logout() {
    await api('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
    window.location.href = '/login';
  }
  async function support() {
    const r = await api<{ conversationId: string }>('/api/conversations/support', { method: 'POST' });
    router.push(`/chat?c=${r.conversationId}`);
  }

  return (
    <Menu.Root>
      <Menu.Trigger className="flex items-center gap-2 rounded-xl p-1 pr-2 hover:bg-bg-elev">
        <Avatar name={name} src={me.kind === 'user' ? me.image?.url : null} size={32} />
        <span className="hidden text-left leading-tight md:block">
          <span className="block max-w-[140px] truncate text-sm font-semibold">{name}</span>
          <span className="block text-[11px] text-ink-lo">{role}</span>
        </span>
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content align="end" sideOffset={8} className="panel z-50 min-w-[200px] p-1.5">
          <Menu.Item asChild>
            <Link href="/profile" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm outline-none data-[highlighted]:bg-bg-elev">
              <User className="size-4" /> Profile
            </Link>
          </Menu.Item>
          {me.kind === 'user' && (
            <Menu.Item onSelect={support} className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm outline-none data-[highlighted]:bg-bg-elev">
              <LifeBuoy className="size-4" /> {me.role === 'CUSTOMER' ? 'Ask support' : 'Chat with Admin'}
            </Menu.Item>
          )}
          <Menu.Separator className="my-1 h-px bg-line" />
          <Menu.Item onSelect={logout} className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm text-state-err outline-none data-[highlighted]:bg-bg-elev">
            <LogOut className="size-4" /> Log out
          </Menu.Item>
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}

function Header() {
  const { me } = useMe();
  const pathname = usePathname();
  const items = navFor(me);
  const active = (href: string) => pathname === href || (href !== homePath(me) && pathname.startsWith(href + '/'));

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg-card">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6">
        <Logo href={homePath(me)} />
        <nav className="ml-4 hidden items-center gap-1 lg:flex">
          {items.map((i) => (
            <Link
              key={i.href}
              href={i.href}
              className={cn(
                'rounded-full px-3.5 py-1.5 text-sm font-medium transition',
                active(i.href) ? 'bg-primary text-on-primary' : 'text-ink-mid hover:text-ink-hi',
              )}
            >
              {i.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-1.5">
          <ConnectionDot />
          <ThemeToggle />
          <NotificationBell />
          {me.kind === 'user' && me.role === 'CUSTOMER' && (
            <>
              <SupportButton />
              <CartButton />
            </>
          )}
          <UserMenu />
        </div>
      </div>
      <nav className="flex gap-1 overflow-x-auto px-4 pb-2 lg:hidden">
        {items.map((i) => (
          <Link
            key={i.href}
            href={i.href}
            className={cn(
              'shrink-0 rounded-full px-3 py-1.5 text-sm font-medium',
              active(i.href) ? 'bg-primary text-on-primary' : 'text-ink-mid',
            )}
          >
            {i.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}

export function AppShell({ me, children }: { me: Me; children: React.ReactNode }) {
  return (
    <ToastProvider>
      <RealtimeProvider expectedId={me.id}>
        <SessionProvider initial={me}>
          <GlobalListeners />
          <Header />
          <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">{children}</main>
        </SessionProvider>
      </RealtimeProvider>
    </ToastProvider>
  );
}

export function PageTitle({ title, subtitle, action }: { title: React.ReactNode; subtitle?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-ink-mid">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
