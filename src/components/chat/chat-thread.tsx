'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowLeft, Check as CheckIcon, ChevronDown, Copy, Download, ExternalLink, FileText, Link2, Loader2, Lock, Paperclip, Send, ShieldCheck, Smile, X } from 'lucide-react';
import { AccountThumb } from '@/components/linkedin-card';
import { Countdown, StatusBadge } from '@/components/post-bits';
import { useOnReconnect, useRoom, useSocketEvent } from '@/components/providers/realtime';
import { useMe } from '@/components/providers/session';
import { useToast } from '@/components/providers/toast';
import { Button } from '@/components/ui/button';
import { Avatar, Badge, Empty, Input, Spinner } from '@/components/ui/primitives';
import { ACCOUNT_KIND_LABEL } from '@/lib/account-kinds';
import { MethodIcon, describePayment } from '@/components/payment-method-picker';
import { api, ApiError } from '@/lib/client/api';
import { useCountdown } from '@/lib/client/clock';
import type { Attachment, Check, CheckStatus, Conversation, Message, Post } from '@/lib/client/types';
import { cn, formatPrice } from '@/lib/utils';

type Deal = { latestCheck: Check | null; canSendText: boolean; isHolder: boolean; isClient: boolean };
type MessagesResponse = { messages: Message[]; nextCursor: string | null; readOnly: boolean; deal: Deal | null };

const typeLabel = { DEAL: 'Deal', ADMIN_CLIENT: 'Support · Client', ADMIN_CUSTOMER: 'Support · Customer' } as const;

const checkLabel: Record<CheckStatus, string> = {
  PENDING: 'Waiting for review',
  CHECKED: 'Checked',
  NOT_CHECKED: 'Not checked',
  EXPIRED: 'Expired',
};

export function ChatThread({ conversationId, adminView, onBack }: { conversationId: string; adminView?: boolean; onBack?: () => void }) {
  const { me } = useMe();
  const toast = useToast();
  const router = useRouter();
  const [conv, setConv] = useState<Conversation | null>(null);
  const [data, setData] = useState<MessagesResponse | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  const messagesUrl = adminView ? `/api/admin/conversations/${conversationId}/messages` : `/api/conversations/${conversationId}/messages`;
  const isParticipant = conv?.isParticipant ?? false;

  const markRead = useCallback(() => {
    if (!adminView) void api(`/api/conversations/${conversationId}/read`, { method: 'POST' }).catch(() => undefined);
  }, [adminView, conversationId]);

  const load = useCallback(async () => {
    try {
      const [c, m] = await Promise.all([
        api<{ conversation: Conversation }>(`/api/conversations/${conversationId}`),
        api<MessagesResponse>(messagesUrl),
      ]);
      setConv(c.conversation);
      setData(m);
      setError(null);
      stickToBottom.current = true;
      if (c.conversation.isParticipant) markRead();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load this chat.');
    }
  }, [conversationId, messagesUrl, markRead]);

  useEffect(() => {
    setConv(null);
    setData(null);
    void load();
  }, [load]);
  useOnReconnect(load);
  useRoom('conversation', conversationId);

  // Messages from others that arrived while the user was scrolled up or the tab was hidden.
  // They stay unread (server-side too) until the user is back at the bottom of a visible tab.
  const [atBottom, setAtBottom] = useState(true);
  const [unseen, setUnseen] = useState(0);
  const pendingRead = useRef(false);

  const isNearBottom = () => {
    const el = scroller.current;
    return !el || el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  };

  const flushRead = useCallback(() => {
    setUnseen(0);
    if (pendingRead.current && isParticipant) {
      pendingRead.current = false;
      markRead();
    }
  }, [isParticipant, markRead]);

  function onScroll() {
    const bottom = isNearBottom();
    setAtBottom(bottom);
    if (bottom && !document.hidden) flushRead();
  }

  function scrollToBottom() {
    const el = scroller.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    flushRead();
  }

  useEffect(() => {
    const onVisible = () => {
      if (!document.hidden && isNearBottom()) flushRead();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [flushRead]);

  useSocketEvent<{ message: Message }>('message:new', ({ message }) => {
    if (message.conversationId !== conversationId) return;
    const bottom = isNearBottom();
    stickToBottom.current = bottom;
    setData((d) => (d && !d.messages.some((m) => m.id === message.id) ? { ...d, messages: [...d.messages, message] } : d));
    const fromOther = !!message.sender && message.sender.id !== me.id;
    if (fromOther && (document.hidden || !bottom)) {
      pendingRead.current = true;
      if (!bottom) setUnseen((n) => n + 1);
      // Tab is in the background: also raise a browser notification. The bell toast is sent separately.
      if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
        const n = new Notification(`New message from ${message.sender!.name}`, {
          body: message.attachment ? `Sent a file: ${message.attachment.name}` : (message.body ?? '').slice(0, 140),
          tag: `msg:${message.id}`,
        });
        n.onclick = () => window.focus();
      }
    } else if (isParticipant) {
      markRead();
    }
    // CHECK_REQUEST / SYSTEM messages change what the composer allows (TEXT and FILE do not).
    if (message.type !== 'TEXT' && message.type !== 'FILE') void load();
  });
  useSocketEvent<{ post: Post }>('post:updated', ({ post }) => {
    if (conv?.post?.id === post.id) setConv((c) => c && { ...c, post: { ...c.post!, ...post, holderName: post.holderName ?? c.post!.holderName } });
  });
  useSocketEvent<{ conversationId: string }>('check:updated', (p) => {
    if (p.conversationId === conversationId) void load();
  });
  useSocketEvent<{ conversationId: string | null }>('post:expired', (p) => {
    if (p.conversationId === conversationId) void load();
  });

  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [data?.messages.length]);

  async function loadMore() {
    if (!data?.nextCursor) return;
    setLoadingMore(true);
    const el = scroller.current;
    const prevHeight = el?.scrollHeight ?? 0;
    try {
      const r = await api<MessagesResponse>(`${messagesUrl}?cursor=${data.nextCursor}`);
      stickToBottom.current = false;
      setData((d) => d && { ...d, messages: [...r.messages, ...d.messages], nextCursor: r.nextCursor });
      requestAnimationFrame(() => {
        if (el) el.scrollTop = el.scrollHeight - prevHeight;
      });
    } finally {
      setLoadingMore(false);
    }
  }

  async function review(check: Check, action: 'checked' | 'not-checked') {
    try {
      const r = await api<{ conversationId: string }>(`/api/checks/${check.id}/${action}`, { method: 'POST' });
      if (action === 'checked') {
        toast({ title: 'Checked - completed', tone: 'success' });
        router.replace(`/chat?c=${r.conversationId}`);
      } else {
        toast({ title: 'Marked as not checked', body: 'The customer can send new checking info.' });
      }
      await load();
    } catch (e) {
      const expired = e instanceof ApiError && e.code === 'TIME_EXPIRED';
      toast({ title: expired ? 'Time expired' : e instanceof ApiError ? e.message : 'Could not update.', tone: 'error' });
      await load();
    }
  }

  if (error) return <Empty title={error} />;
  if (!conv || !data) return <div className="flex flex-1 items-center justify-center"><Spinner /></div>;

  const post = conv.post;
  const progressing = post?.status === 'PROGRESSING';
  const others = conv.participants.filter((p) => p.id !== me.id);
  const nameOf = (m: Message) => (m.sender ? (m.sender.id === me.id ? 'You' : m.sender.name) : 'System');

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-3 border-b border-line/70 px-4 py-3">
        {onBack && (
          <button onClick={onBack} className="rounded-lg p-1 text-ink-mid hover:bg-bg-elev lg:hidden" aria-label="Back">
            <ArrowLeft className="size-5" />
          </button>
        )}
        <Avatar name={others[0]?.name ?? conv.title} src={others[0]?.image?.url} size={38} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{adminView ? conv.participants.map((p) => `${p.name} (${p.role.toLowerCase()})`).join(' · ') : conv.title}</p>
          <p className="truncate text-xs text-ink-lo">
            {typeLabel[conv.type]}
            {post && ` · ${ACCOUNT_KIND_LABEL[post.kind ?? 'LINKEDIN']} · ${post.name || post.title} · ${formatPrice(post.price)}`}
          </p>
        </div>
        {post && <StatusBadge status={post.status} clientChecking={!!post.progressingPausedAt} />}
        {progressing && <Countdown expiresAt={post!.progressingExpiresAt} paused={!!post!.progressingPausedAt} onDone={() => void load()} big />}
      </div>

      <div className="relative flex min-h-0 flex-1 flex-col">
      <div ref={scroller} onScroll={onScroll} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {data.nextCursor && (
          <div className="flex justify-center">
            <Button size="sm" variant="ghost" onClick={loadMore} loading={loadingMore}>Load earlier messages</Button>
          </div>
        )}
        {data.messages.length === 0 && <Empty title="No messages yet" hint="Say hello." />}
        {data.messages.map((m) => {
          if (m.type === 'SYSTEM') {
            return (
              <div key={m.id} className="flex justify-center">
                <span className="rounded-full border border-line bg-bg-elev px-3 py-1 text-xs text-ink-mid">{m.body}</span>
              </div>
            );
          }
          const mine = m.sender?.id === me.id;
          return (
            <div key={m.id} className={cn('flex flex-col', mine ? 'items-end' : 'items-start')}>
              <span className="mb-1 px-1 text-[11px] text-ink-lo">
                {nameOf(m)} · {new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
              {m.type === 'CHECK_REQUEST' ? (
                <CheckCard
                  message={m}
                  post={post}
                  canReview={!!data.deal?.isClient && !adminView && progressing}
                  expiresAt={post?.progressingExpiresAt ?? null}
                  paused={!!post?.progressingPausedAt}
                  onReview={review}
                />
              ) : (
                <div
                  className={cn(
                    'max-w-[80%] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-sm',
                    mine ? 'rounded-br-md bg-primary text-on-primary' : 'rounded-bl-md bg-bg-elev text-ink-hi',
                  )}
                >
                  {m.attachment && <AttachmentView file={m.attachment} mine={mine} />}
                  {m.body && <p className={cn(m.attachment && 'mt-2')}>{m.body}</p>}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {!atBottom && (
        <button
          type="button"
          onClick={scrollToBottom}
          aria-label={unseen > 0 ? `Scroll to bottom, ${unseen} unread` : 'Scroll to bottom'}
          className="absolute bottom-4 right-4 flex size-11 items-center justify-center rounded-full border border-line bg-bg-card text-ink-mid shadow-lift transition hover:text-ink-hi animate-in fade-in-0 zoom-in-90"
        >
          <ChevronDown className="size-5" />
          {unseen > 0 && (
            <span className="absolute -top-2.5 left-1/2 flex h-5 min-w-[20px] -translate-x-1/2 items-center justify-center rounded-full bg-brand-mint px-1.5 text-[11px] font-bold text-on-mint">
              {unseen > 99 ? '99+' : unseen}
            </span>
          )}
        </button>
      )}
      </div>

      <Composer
        conversationId={conversationId}
        readOnly={data.readOnly || !isParticipant}
        deal={data.deal}
        post={post}
        onSent={(message) => {
          stickToBottom.current = true;
          flushRead();
          setData((d) => (d && !d.messages.some((x) => x.id === message.id) ? { ...d, messages: [...d.messages, message] } : d));
        }}
        onResubmitted={() => void load()}
      />
    </div>
  );
}

function formatSize(bytes: number) {
  return bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(0)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Images preview inline (click opens full size) with a download bar; other files show a download card. */
function AttachmentView({ file, mine }: { file: Attachment; mine: boolean }) {
  if (file.isImage) {
    return (
      <div className="space-y-1.5">
        <a href={file.url} target="_blank" rel="noopener noreferrer" className="block" title="Open full size">
          {/* eslint-disable-next-line @next/next/no-img-element -- private, authenticated file URL */}
          <img
            src={file.url}
            alt={file.name}
            width={file.width ?? undefined}
            height={file.height ?? undefined}
            loading="lazy"
            className="max-h-72 w-auto max-w-full rounded-xl object-contain"
          />
        </a>
        <a
          href={`${file.url}?download=1`}
          download={file.name}
          className={cn(
            'flex items-center gap-2 rounded-lg px-2 py-1 text-[11px] no-underline',
            mine ? 'bg-white/10 hover:bg-white/20' : 'bg-bg-base/60 hover:bg-bg-base',
          )}
          aria-label={`Download ${file.name}`}
        >
          <span className="min-w-0 flex-1 truncate">{file.name}</span>
          <span className="shrink-0 opacity-70">{formatSize(file.size)}</span>
          <Download className="size-3.5 shrink-0" />
        </a>
      </div>
    );
  }
  return (
    <a
      href={`${file.url}?download=1`}
      download={file.name}
      className={cn(
        'flex min-w-[200px] items-center gap-3 rounded-xl border px-3 py-2 no-underline',
        mine ? 'border-white/25 bg-white/10 hover:bg-white/15' : 'border-line bg-bg-base/60 hover:bg-bg-base',
      )}
    >
      <FileText className="size-8 shrink-0 opacity-80" />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{file.name}</span>
        <span className="block text-[11px] opacity-70">{formatSize(file.size)}</span>
      </span>
      <Download className="size-4 shrink-0 opacity-80" />
    </a>
  );
}

const EMOJIS = [
  '😀', '😂', '🙂', '😊', '😍', '😎', '🤔', '😅', '😉', '🥳', '😢', '😮',
  '👍', '👎', '👏', '🙏', '💪', '🤝', '👌', '✌️', '👋', '🙌', '🔥', '✨',
  '❤️', '💯', '✅', '❌', '⚡', '🎉', '💰', '💵', '📎', '📄', '⏰', '🚀',
];

/** A small emoji palette; picking one inserts it at the cursor. */
function EmojiPicker({ onPick }: { onPick: (emoji: string) => void }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);
  return (
    <div ref={box} className="relative">
      <Button type="button" variant="ghost" size="icon" className="size-10" aria-label="Insert emoji" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <Smile />
      </Button>
      {open && (
        <div role="menu" className="absolute bottom-12 left-0 z-20 grid w-72 grid-cols-6 gap-1 rounded-xl border border-line bg-bg-elev p-2 shadow-lg">
          {EMOJIS.map((e) => (
            <button
              key={e}
              type="button"
              role="menuitem"
              className="rounded-lg p-1.5 text-xl leading-none hover:bg-bg-base"
              onClick={() => onPick(e)}
              aria-label={`Insert ${e}`}
            >
              {e}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const statusPill: Record<CheckStatus, string> = {
  PENDING: 'bg-state-warn/15 text-state-warn',
  CHECKED: 'bg-state-ok/15 text-state-ok',
  NOT_CHECKED: 'bg-state-err/15 text-state-err',
  EXPIRED: 'bg-bg-elev text-ink-lo',
};

/** "https://example.com/a/confirm236?x" -> "confirm236" (the part people recognise); falls back to the host. */
function shortLink(url: string) {
  try {
    const u = new URL(url);
    const last = u.pathname.split('/').filter(Boolean).pop();
    return decodeURIComponent(last ?? u.hostname.replace(/^www\./, ''));
  } catch {
    return url;
  }
}

function CheckCard({
  message,
  post,
  canReview,
  expiresAt,
  paused,
  onReview,
}: {
  message: Message;
  post: Post | null | undefined;
  canReview: boolean;
  expiresAt: string | null;
  paused: boolean;
  onReview: (c: Check, a: 'checked' | 'not-checked') => Promise<void>;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  // While Client Checking the clock is stopped, so the old deadline never hides the review buttons.
  const countdown = useCountdown(paused ? null : expiresAt);
  const done = !paused && countdown.done;
  const check = message.check;
  const pending = check?.status === 'PENDING';
  const showButtons = canReview && pending;
  const name = post?.name?.trim();
  const title = post?.title?.trim();
  const heading = name || title || 'Account';
  const link = message.body ?? '';
  const method = check?.paymentType ? describePayment({ id: check.paymentType, type: check.paymentType, address: check.paymentAddress ?? '' }) : null;

  async function click(a: 'checked' | 'not-checked') {
    if (!check || busy) return;
    setBusy(a);
    await onReview(check, a);
    setBusy(null);
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: 'Copied', tone: 'success' });
    } catch {
      toast({ title: 'Could not copy.', tone: 'error' });
    }
  }

  return (
    <div className="w-full max-w-md rounded-2xl border border-line bg-bg-card p-4 shadow-soft">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-base font-semibold text-ink-mid">
          <ShieldCheck className="size-5 text-primary" /> Checking info
        </p>
        {check && (
          <span className={cn('inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium', statusPill[check.status])}>
            <span className="size-1.5 rounded-full bg-current" />
            {checkLabel[check.status]}
          </span>
        )}
      </div>

      {post && (
        <div className="mt-3.5 flex items-start gap-3.5">
          <AccountThumb name={heading} photo={post.image?.url} className="size-14" />
          <div className="min-w-0 flex-1 leading-snug">
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="truncate text-lg font-bold text-ink-hi">{heading}</span>
              <span className="rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">{ACCOUNT_KIND_LABEL[post.kind ?? 'LINKEDIN']}</span>
            </p>
            {name && title && title !== name && <p className="truncate text-sm text-ink-mid">{title.replace(/^https?:\/\/(www\.)?/i, '')}</p>}
            <p className="mt-0.5 flex items-center gap-2 text-sm text-ink-mid">
              {(post.kind ?? 'LINKEDIN') === 'LINKEDIN' && (
                <>
                  <span className="inline-flex items-center gap-1.5">
                    <Link2 className="size-4" /> {post.connects} connects
                  </span>
                  <span className="text-ink-lo">•</span>
                </>
              )}
              <span className="font-semibold text-ink-hi">{formatPrice(post.price)}</span>
            </p>
          </div>
        </div>
      )}

      <div className={cn('mt-3.5 grid gap-2.5', method && 'grid-cols-2')}>
        <div className="min-w-0 rounded-xl bg-bg-elev/70 px-3.5 py-2.5">
          <p className="text-xs text-ink-lo">Checking link</p>
          <a
            href={link || '#'}
            target="_blank"
            rel="noopener noreferrer nofollow"
            title={link}
            className="mt-1 flex items-center gap-1.5 text-base font-medium text-primary hover:underline"
          >
            <span className="truncate">{shortLink(link)}</span>
            <ExternalLink className="size-4 shrink-0" />
          </a>
        </div>
        {method && (
          <div className="min-w-0 rounded-xl bg-bg-elev/70 px-3.5 py-2.5">
            <p className="text-xs text-ink-lo">Paid with</p>
            <p className="mt-1 flex items-center gap-2">
              <MethodIcon method={method} className="size-6 text-xs" />
              <span className="truncate text-base font-semibold text-ink-hi">{method.code}</span>
              {method.network && (
                <span className={cn('rounded px-1.5 py-px text-[10px] font-extrabold', method.network.className)}>{method.network.badge}</span>
              )}
            </p>
          </div>
        )}
      </div>

      {check?.paymentAddress && (
        <div className="mt-2.5 flex items-center gap-3 rounded-xl border border-line px-3.5 py-2.5">
          <span className="shrink-0 text-xs text-ink-lo">Sent to</span>
          <span className="min-w-0 flex-1 truncate font-mono text-sm text-ink-hi" title={check.paymentAddress}>
            {check.paymentAddress}
          </span>
          <button
            type="button"
            onClick={() => void copy(check.paymentAddress!)}
            className="shrink-0 rounded-lg p-1.5 text-ink-mid transition hover:bg-bg-elev hover:text-ink-hi"
            aria-label="Copy address"
            title="Copy"
          >
            <Copy className="size-4" />
          </button>
        </div>
      )}

      {showButtons ? (
        done ? (
          <p className="mt-3 rounded-xl bg-state-err/10 px-3.5 py-2.5 text-center text-sm font-semibold text-state-err">Time expired</p>
        ) : (
          <div className="mt-3 grid grid-cols-2 gap-2.5">
            <Button
              className="w-full rounded-xl bg-state-ok text-white hover:bg-state-ok/90"
              onClick={() => click('checked')}
              loading={busy === 'checked'}
              disabled={!!busy}
            >
              <CheckIcon /> Checked
            </Button>
            <Button
              variant="outline"
              className="w-full rounded-xl text-state-err hover:bg-state-err/10 hover:text-state-err"
              onClick={() => click('not-checked')}
              loading={busy === 'not-checked'}
              disabled={!!busy}
            >
              <X /> Not checked
            </Button>
          </div>
        )
      ) : (
        pending && (
          <p className="mt-3 flex items-center justify-center gap-2.5 rounded-xl bg-bg-elev/70 px-3.5 py-2.5 text-sm text-ink-mid">
            <Loader2 className="size-4 animate-spin text-primary" /> Waiting for the client to review the link
          </p>
        )
      )}
    </div>
  );
}

function Composer({
  conversationId,
  readOnly,
  deal,
  post,
  onSent,
  onResubmitted,
}: {
  conversationId: string;
  readOnly: boolean;
  deal: Deal | null;
  post: Post | null;
  onSent: (m: Message) => void;
  onResubmitted: () => void;
}) {
  const toast = useToast();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [text]);
  const paused = !!post?.progressingPausedAt;
  const countdown = useCountdown(post?.status === 'PROGRESSING' && !paused ? post.progressingExpiresAt : null);
  // Client Checking: time is stopped, so the deal is not closed even if the old deadline passed.
  const done = !paused && countdown.done;

  if (readOnly) {
    return (
      <div className="flex items-center justify-center gap-2 border-t border-line/70 px-4 py-3 text-xs text-ink-lo">
        <Lock className="size-3.5" /> Read-only. Admins can view deal chats but not send messages.
      </div>
    );
  }

  // Customer in a deal chat before "Checked": only (re)submitting checking info is allowed.
  if (deal && !deal.canSendText) {
    const canResubmit = deal.isHolder && post?.status === 'PROGRESSING' && !done && deal.latestCheck?.status === 'NOT_CHECKED';
    if (canResubmit && post) {
      return (
        <form
          className="flex gap-2 border-t border-line/70 p-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              await api(`/api/posts/${post.id}/check`, { json: { url: text } });
              setText('');
              onResubmitted();
            } catch (err) {
              toast({ title: err instanceof ApiError ? err.message : 'Could not submit.', tone: 'error' });
            } finally {
              setBusy(false);
            }
          }}
        >
          <Input type="url" required placeholder="New checking link (https://…)" value={text} onChange={(e) => setText(e.target.value)} />
          <Button type="submit" loading={busy}><Send /> Resubmit</Button>
        </form>
      );
    }
    const why =
      post?.status !== 'PROGRESSING' || done
        ? 'This deal is closed.'
        : deal.latestCheck?.status === 'PENDING'
          ? 'Waiting for client review.'
          : 'Chat opens after Checked.';
    return <div className="border-t border-line/70 px-4 py-3 text-center text-xs text-ink-lo">{why}</div>;
  }

  function onComposerKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key !== 'Enter' || e.nativeEvent.isComposing) return;
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      e.currentTarget.form?.requestSubmit();
    }
  }

  function insertEmoji(emoji: string) {
    const el = inputRef.current;
    const start = el?.selectionStart ?? text.length;
    const end = el?.selectionEnd ?? text.length;
    setText(text.slice(0, start) + emoji + text.slice(end));
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + emoji.length, start + emoji.length);
    });
  }

  function pickFile(f: File | undefined) {
    if (!f) return;
    if (f.size > MAX_FILE_BYTES) {
      toast({ title: 'Files must be 10 MB or smaller.', tone: 'error' });
      return;
    }
    setFile(f);
    inputRef.current?.focus();
  }

  return (
    <form
      className="border-t border-line/70 p-3"
      onSubmit={async (e) => {
        e.preventDefault();
        const body = text.trim();
        if (!body && !file) return;
        setBusy(true);
        try {
          let r: { message: Message };
          if (file) {
            const form = new FormData();
            form.append('file', file);
            if (body) form.append('caption', body);
            r = await api<{ message: Message }>(`/api/conversations/${conversationId}/files`, { form });
            setFile(null);
          } else {
            r = await api<{ message: Message }>(`/api/conversations/${conversationId}/messages`, { json: { body } });
          }
          setText('');
          onSent(r.message);
        } catch (err) {
          toast({ title: err instanceof ApiError ? err.message : 'Message not sent.', tone: 'error' });
        } finally {
          setBusy(false);
        }
      }}
    >
      {file && (
        <div className="mb-2 flex items-center gap-2 rounded-lg border border-line bg-bg-base/60 px-3 py-1.5 text-xs">
          <Paperclip className="size-3.5 shrink-0 text-ink-lo" />
          <span className="min-w-0 flex-1 truncate">{file.name}</span>
          <span className="shrink-0 text-ink-lo">{formatSize(file.size)}</span>
          <button type="button" onClick={() => setFile(null)} className="rounded p-0.5 text-ink-lo hover:text-ink-hi" aria-label="Remove file">
            <X className="size-3.5" />
          </button>
        </div>
      )}
      <div className="flex items-end gap-2">
        <input
          ref={fileRef}
          type="file"
          className="hidden"
          accept={FILE_ACCEPT}
          onChange={(e) => {
            pickFile(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
        <Button type="button" variant="ghost" size="icon" className="size-10 shrink-0" aria-label="Attach a file" onClick={() => fileRef.current?.click()} disabled={busy}>
          <Paperclip />
        </Button>
        <EmojiPicker onPick={insertEmoji} />
        <textarea
          ref={inputRef}
          rows={1}
          placeholder={file ? 'Add a caption (optional)...' : 'Type a message...'}
          title="Enter for a new line. Ctrl+Enter to send."
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onComposerKeyDown}
          onPaste={(e) => {
            const pasted = e.clipboardData.files?.[0];
            if (pasted) {
              e.preventDefault();
              pickFile(pasted);
            }
          }}
          maxLength={4000}
          className="field h-auto max-h-40 min-h-10 resize-none py-2.5 leading-5"
        />
        <Button type="submit" size="icon" className="size-10 shrink-0" loading={busy} aria-label="Send">
          {!busy && <Send />}
        </Button>
      </div>
      <p className="mt-1.5 pl-24 text-[11px] text-ink-lo">Enter for a new line · Ctrl+Enter to send</p>
    </form>
  );
}

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const FILE_ACCEPT = '.jpg,.jpeg,.png,.webp,.gif,.pdf,.docx,.xlsx,.pptx,.zip,.txt,.csv,.md';
