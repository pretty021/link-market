import type { Server } from 'socket.io';

type RealtimeState = {
  io: Server | null;
  // userId/adminId -> number of open sockets
  online: Map<string, number>;
  // postId -> (customerId -> number of sockets viewing)
  viewers: Map<string, Map<string, number>>;
};

const g = globalThis as unknown as { __realtime?: RealtimeState };
const state: RealtimeState = (g.__realtime ??= { io: null, online: new Map(), viewers: new Map() });

export const rooms = {
  user: (id: string) => `user:${id}`,
  admin: (id: string) => `admin:${id}`,
  admins: 'admins',
  clients: 'clients',
  customers: 'customers',
  post: (id: string) => `post:${id}`,
  conversation: (id: string) => `conversation:${id}`,
};

export function setIo(io: Server) {
  state.io = io;
}

export function getIo() {
  return state.io;
}

export function emit(target: string | string[], event: string, payload: unknown) {
  const io = state.io;
  if (!io) return;
  const list = (Array.isArray(target) ? target : [target]).filter(Boolean);
  if (list.length === 0) return;
  io.to(list).emit(event, payload);
}

export function markOnline(id: string) {
  state.online.set(id, (state.online.get(id) ?? 0) + 1);
}

export function markOffline(id: string): boolean {
  const n = (state.online.get(id) ?? 1) - 1;
  if (n <= 0) {
    state.online.delete(id);
    return true;
  }
  state.online.set(id, n);
  return false;
}

export function onlineIds(): Set<string> {
  return new Set(state.online.keys());
}

export function addViewer(postId: string, customerId: string) {
  const m = state.viewers.get(postId) ?? new Map<string, number>();
  m.set(customerId, (m.get(customerId) ?? 0) + 1);
  state.viewers.set(postId, m);
  return m.size;
}

export function removeViewer(postId: string, customerId: string) {
  const m = state.viewers.get(postId);
  if (!m) return 0;
  const n = (m.get(customerId) ?? 1) - 1;
  if (n <= 0) m.delete(customerId);
  else m.set(customerId, n);
  if (m.size === 0) state.viewers.delete(postId);
  return m.size;
}

export function viewerCount(postId: string) {
  return state.viewers.get(postId)?.size ?? 0;
}

export async function isViewingConversation(principalRoom: string, conversationId: string) {
  const io = state.io;
  if (!io) return false;
  const sockets = await io.in(principalRoom).fetchSockets();
  return sockets.some((s) => s.rooms.has(rooms.conversation(conversationId)));
}

export async function disconnectPrincipal(principalRoom: string) {
  const io = state.io;
  if (!io) return;
  io.to(principalRoom).emit('session:revoked', {});
  io.in(principalRoom).disconnectSockets(true);
}
