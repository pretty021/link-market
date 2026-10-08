'use client';

import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { syncClock } from '@/lib/client/clock';

type Ctx = { socket: Socket | null; connected: boolean };
const SocketCtx = createContext<Ctx>({ socket: null, connected: false });

const HEARTBEAT_MS = 30_000;

export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const s = io({ path: '/socket.io', withCredentials: true, transports: ['websocket', 'polling'] });
    setSocket(s);
    // Keep the countdown clock in sync with whatever the server sends.
    s.onAny((_event, payload) => {
      if (payload && typeof payload === 'object' && 'serverNow' in payload) syncClock(payload.serverNow as string);
    });
    s.on('connect', () => setConnected(true));
    s.on('disconnect', () => setConnected(false));
    s.on('session:revoked', () => {
      window.location.href = '/login?blocked=1';
    });
    const hb = setInterval(() => s.connected && s.emit('heartbeat'), HEARTBEAT_MS);
    return () => {
      clearInterval(hb);
      s.disconnect();
    };
  }, []);

  return <SocketCtx.Provider value={{ socket, connected }}>{children}</SocketCtx.Provider>;
}

export const useSocket = () => useContext(SocketCtx);

/** Subscribes to a socket event; the latest handler is always used without re-subscribing. */
export function useSocketEvent<T = any>(event: string, handler: (payload: T) => void) {
  const { socket } = useSocket();
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    if (!socket) return;
    const fn = (p: T) => ref.current(p);
    socket.on(event, fn);
    return () => {
      socket.off(event, fn);
    };
  }, [socket, event]);
}

/** Runs `refetch` whenever the socket reconnects (events missed while offline are not replayed). */
export function useOnReconnect(refetch: () => void) {
  const { socket } = useSocket();
  const ref = useRef(refetch);
  ref.current = refetch;
  useEffect(() => {
    if (!socket) return;
    let first = true;
    const fn = () => {
      if (first) {
        first = false;
        return;
      }
      ref.current();
    };
    if (socket.connected) first = false;
    socket.on('connect', fn);
    return () => {
      socket.off('connect', fn);
    };
  }, [socket]);
}

/** Joins a room-backed resource (post or conversation) while mounted, and re-joins after reconnects. */
export function useRoom(kind: 'post' | 'conversation', id: string | null | undefined) {
  const { socket } = useSocket();
  useEffect(() => {
    if (!socket || !id) return;
    const payload = kind === 'post' ? { postId: id } : { conversationId: id };
    const join = () => socket.emit(`${kind}:join`, payload);
    if (socket.connected) join();
    socket.on('connect', join);
    return () => {
      socket.off('connect', join);
      socket.emit(`${kind}:leave`, payload);
    };
  }, [socket, kind, id]);
}
