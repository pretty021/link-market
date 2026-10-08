'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowLeft, Check as CheckIcon, ExternalLink, Lock, Send, X } from 'lucide-react';
import { Countdown, StatusBadge } from '@/components/post-bits';
import { useOnReconnect, useRoom, useSocketEvent } from '@/components/providers/realtime';
import { useMe } from '@/components/providers/session';
import { useToast } from '@/components/providers/toast';
import { Button } from '@/components/ui/button';
import { Avatar, Badge, Empty, Input, Spinner } from '@/components/ui/primitives';
import { api, ApiError } from '@/lib/client/api';
import { useCountdown } from '@/lib/client/clock';
import type { Check, CheckStatus, Conversation, Message, Post } from '@/lib/client/types';
import { cn, formatPrice } from '@/lib/utils';

type Deal = { latestCheck: Check | null; canSendText: boolean; isHolder: boolean; isClient: boolean };
type MessagesResponse = { messages: Message[]; nextCursor: string | null; readOnly: boolean; deal: Deal | null };

const typeLabel = { DEAL: 'Deal', ADMIN_CLIENT: 'Support · Client', ADMIN_CUSTOMER: 'Support · Customer' } as const;

const checkTone: Record<CheckStatus, 'amber' | 'mint' | 'red' | 'slate'> = {
  PENDING: 'amber',
  CHECKED: 'mint',
  NOT_CHECKED: 'red',
  EXPIRED: 'slate',
};
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

  useSocketEvent<{ message: Message }>('message:new', ({ message }) => {
    if (message.conversationId !== conversationId) return;
    const el = scroller.current;
    stickToBottom.current = !el || el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    setData((d) => (d && !d.messages.some((m) => m.id === message.id) ? { ...d, messages: [...d.messages, message] } : d));
    if (isParticipant) markRead();
    // CHECK_REQUEST / SYSTEM messages change what the composer allows.
    if (message.type !== 'TEXT') void load();
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
            {post && ` · ${post.title} · ${formatPrice(post.price)}`}
          </p>
        </div>
        {post && <StatusBadge status={post.status} />}
        {progressing && <Countdown expiresAt={post!.progressingExpiresAt} onDone={() => void load()} big />}
      </div>

      <div ref={scroller} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {data.nextCursor && (
          <div className="flex justify-center">
            <Button size="sm" variant="ghost" onClick={loadMore} loading={loadingMore}>Load earlier messages</Button>
          </div>
        )}
        {data.messages.length === 0 && <Empty title="No messages yet" hint="Say hello to start the conversation." />}
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
                  canReview={!!data.deal?.isClient && !adminView && progressing}
                  expiresAt={post?.progressingExpiresAt ?? null}
                  onReview={review}
                />
              ) : (
                <div
                  className={cn(
                    'max-w-[80%] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-sm',
                    mine ? 'rounded-br-md bg-brand-purple text-white' : 'rounded-bl-md bg-bg-elev text-ink-hi',
                  )}
                >
                  {m.body}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <Composer
        conversationId={conversationId}
        readOnly={data.readOnly || !isParticipant}
        deal={data.deal}
        post={post}
        onSent={(message) => {
          stickToBottom.current = true;
          setData((d) => (d && !d.messages.some((x) => x.id === message.id) ? { ...d, messages: [...d.messages, message] } : d));
        }}
        onResubmitted={() => void load()}
      />
    </div>
  );
}

function CheckCard({
  message,
  canReview,
  expiresAt,
  onReview,
}: {
  message: Message;
  canReview: boolean;
  expiresAt: string | null;
  onReview: (c: Check, a: 'checked' | 'not-checked') => Promise<void>;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const { done } = useCountdown(expiresAt);
  const check = message.check;
  const showButtons = canReview && check?.status === 'PENDING';

  async function click(a: 'checked' | 'not-checked') {
    if (!check || busy) return;
    setBusy(a);
    await onReview(check, a);
    setBusy(null);
  }

  return (
    <div className="w-full max-w-sm rounded-2xl border border-brand-mint/40 bg-brand-mint/5 p-3.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-brand-mint">Checking info</p>
        {check && <Badge tone={checkTone[check.status]}>{checkLabel[check.status]}</Badge>}
      </div>
      <a
        href={message.body ?? '#'}
        target="_blank"
        rel="noopener noreferrer nofollow"
        className="mt-2 flex items-center gap-1.5 break-all text-sm text-ink-hi underline decoration-brand-mint/50 underline-offset-2 hover:text-brand-mint"
      >
        <ExternalLink className="size-3.5 shrink-0" /> {message.body}
      </a>
      {showButtons &&
        (done ? (
          <p className="mt-3 text-sm font-semibold text-state-err">Time expired</p>
        ) : (
          <div className="mt-3 flex gap-2">
            <Button size="sm" className="flex-1" onClick={() => click('checked')} loading={busy === 'checked'} disabled={!!busy}>
              <CheckIcon /> Checked
            </Button>
            <Button size="sm" variant="danger" className="flex-1" onClick={() => click('not-checked')} loading={busy === 'not-checked'} disabled={!!busy}>
              <X /> Not checked
            </Button>
          </div>
        ))}
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
  const { done } = useCountdown(post?.status === 'PROGRESSING' ? post.progressingExpiresAt : null);

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
          <Input type="url" required placeholder="Send new checking info (https://...)" value={text} onChange={(e) => setText(e.target.value)} />
          <Button type="submit" loading={busy}><Send /> Resubmit</Button>
        </form>
      );
    }
    const why =
      post?.status !== 'PROGRESSING' || done
        ? 'This deal is closed.'
        : deal.latestCheck?.status === 'PENDING'
          ? 'Waiting for the client to review your checking info.'
          : 'You can chat once the client marks your checking info as Checked.';
    return <div className="border-t border-line/70 px-4 py-3 text-center text-xs text-ink-lo">{why}</div>;
  }

  return (
    <form
      className="flex gap-2 border-t border-line/70 p-3"
      onSubmit={async (e) => {
        e.preventDefault();
        const body = text.trim();
        if (!body) return;
        setBusy(true);
        try {
          const r = await api<{ message: Message }>(`/api/conversations/${conversationId}/messages`, { json: { body } });
          setText('');
          onSent(r.message);
        } catch (err) {
          toast({ title: err instanceof ApiError ? err.message : 'Message not sent.', tone: 'error' });
        } finally {
          setBusy(false);
        }
      }}
    >
      <Input placeholder="Type a message..." value={text} onChange={(e) => setText(e.target.value)} maxLength={4000} />
      <Button type="submit" size="icon" className="size-10 shrink-0" loading={busy} aria-label="Send">
        {!busy && <Send />}
      </Button>
    </form>
  );
}
