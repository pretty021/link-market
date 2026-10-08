'use client';

import { useCallback, useEffect, useState } from 'react';
import { History } from 'lucide-react';
import { ChatThread } from '@/components/chat/chat-thread';
import { ConversationList } from '@/components/chat/conversation-list';
import { useOnReconnect, useSocketEvent } from '@/components/providers/realtime';
import { Card, Empty } from '@/components/ui/primitives';
import { api } from '@/lib/client/api';
import type { Conversation, Post, UserRow } from '@/lib/client/types';
import { cn } from '@/lib/utils';

const selectCls = 'field h-9 w-auto min-w-0 flex-1 py-0 pr-8 text-xs';

export default function AllChats() {
  const [items, setItems] = useState<Conversation[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [type, setType] = useState('');
  const [userId, setUserId] = useState('');
  const [postId, setPostId] = useState('');
  const [users, setUsers] = useState<UserRow[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);

  useEffect(() => {
    api<{ users: UserRow[] }>('/api/admin/users').then((r) => setUsers(r.users)).catch(() => undefined);
    api<{ posts: Post[] }>('/api/admin/posts').then((r) => setPosts(r.posts)).catch(() => undefined);
  }, []);

  const load = useCallback(async () => {
    const p = new URLSearchParams({ scope: 'all' });
    if (q) p.set('q', q);
    if (type) p.set('type', type);
    if (userId) p.set('userId', userId);
    if (postId) p.set('postId', postId);
    setItems((await api<{ conversations: Conversation[] }>(`/api/admin/conversations?${p}`)).conversations);
  }, [q, type, userId, postId]);

  useEffect(() => {
    const t = setTimeout(() => void load().catch(() => setItems([])), q ? 250 : 0);
    return () => clearTimeout(t);
  }, [load, q]);
  useOnReconnect(load);
  useSocketEvent('message:new', () => void load());

  return (
    <Card className="flex h-[calc(100vh-9.5rem)] min-h-[520px] overflow-hidden lg:h-[calc(100vh-8rem)]">
      <aside className={cn('w-full flex-col border-r border-line/70 lg:flex lg:w-[380px]', selected ? 'hidden' : 'flex')}>
        <div className="space-y-2 border-b border-line/70 px-4 py-3">
          <h1 className="flex items-center gap-2 font-bold"><History className="size-4 text-brand-mint" /> All chats</h1>
          <div className="flex gap-2">
            <select className={selectCls} value={type} onChange={(e) => setType(e.target.value)} aria-label="Type">
              <option value="">All types</option>
              <option value="DEAL">Deal</option>
              <option value="ADMIN_CLIENT">Admin · Client</option>
              <option value="ADMIN_CUSTOMER">Admin · Customer</option>
            </select>
            <select className={selectCls} value={userId} onChange={(e) => setUserId(e.target.value)} aria-label="User">
              <option value="">All users</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.name} ({u.role.toLowerCase()})</option>)}
            </select>
          </div>
          <select className={cn(selectCls, 'w-full')} value={postId} onChange={(e) => setPostId(e.target.value)} aria-label="Post">
            <option value="">All posts</option>
            {posts.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
          </select>
        </div>
        <ConversationList items={items} selected={selected} onSelect={setSelected} q={q} onQ={setQ} showAllParticipants />
      </aside>
      <section className={cn('min-w-0 flex-1 flex-col', selected ? 'flex' : 'hidden lg:flex')}>
        {selected ? (
          <ChatThread key={selected} conversationId={selected} adminView onBack={() => setSelected(null)} />
        ) : (
          <div className="flex flex-1 items-center justify-center">
            <Empty icon={<History />} title="Pick a conversation" hint="You can read every chat. Deal chats are read-only, and reading never changes anyone's unread counts." />
          </div>
        )}
      </section>
    </Card>
  );
}
