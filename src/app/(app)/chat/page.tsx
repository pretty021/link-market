'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useState } from 'react';
import { MessageCircle } from 'lucide-react';
import { ChatThread } from '@/components/chat/chat-thread';
import { ConversationList } from '@/components/chat/conversation-list';
import { useOnReconnect, useSocketEvent } from '@/components/providers/realtime';
import { Card, Empty } from '@/components/ui/primitives';
import { api } from '@/lib/client/api';
import type { Conversation } from '@/lib/client/types';
import { cn } from '@/lib/utils';

function ChatPage() {
  const params = useSearchParams();
  const router = useRouter();
  const selected = params.get('c');
  const [items, setItems] = useState<Conversation[] | null>(null);
  const [q, setQ] = useState('');

  const load = useCallback(async () => {
    const r = await api<{ conversations: Conversation[] }>(`/api/conversations${q ? `?q=${encodeURIComponent(q)}` : ''}`);
    setItems(r.conversations);
  }, [q]);

  useEffect(() => {
    const t = setTimeout(() => void load().catch(() => setItems([])), q ? 250 : 0);
    return () => clearTimeout(t);
  }, [load, q]);
  useOnReconnect(load);
  useSocketEvent('conversation:updated', () => void load());
  useSocketEvent('notification:new', () => void load());
  useSocketEvent<{ message: { conversationId: string } }>('message:new', () => void load());

  // Opening a chat clears its unread badge locally right away.
  useEffect(() => {
    if (selected) setItems((prev) => prev?.map((c) => (c.id === selected ? { ...c, unread: 0 } : c)) ?? prev);
  }, [selected, items?.length]);

  const select = (id: string) => router.push(`/chat?c=${id}`);

  return (
    <Card className="flex h-[calc(100vh-9.5rem)] min-h-[520px] overflow-hidden lg:h-[calc(100vh-8rem)]">
      <aside className={cn('w-full flex-col border-r border-line/70 lg:flex lg:w-[340px]', selected ? 'hidden' : 'flex')}>
        <div className="border-b border-line/70 px-4 py-3">
          <h1 className="font-bold">Messages</h1>
        </div>
        <ConversationList items={items} selected={selected} onSelect={select} q={q} onQ={setQ} />
      </aside>
      <section className={cn('min-w-0 flex-1 flex-col', selected ? 'flex' : 'hidden lg:flex')}>
        {selected ? (
          <ChatThread key={selected} conversationId={selected} onBack={() => router.push('/chat')} />
        ) : (
          <div className="flex flex-1 items-center justify-center">
            <Empty icon={<MessageCircle />} title="Pick a chat" />
          </div>
        )}
      </section>
    </Card>
  );
}

export default function Page() {
  return (
    <Suspense>
      <ChatPage />
    </Suspense>
  );
}
