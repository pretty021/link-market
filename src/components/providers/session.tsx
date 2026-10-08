'use client';

import { createContext, useContext, useState } from 'react';
import type { Me } from '@/lib/client/types';
import { useSocketEvent } from './realtime';

type Ctx = { me: Me; setMe: (m: Me) => void };
const SessionCtx = createContext<Ctx | null>(null);

export function SessionProvider({ initial, children }: { initial: Me; children: React.ReactNode }) {
  const [me, setMe] = useState<Me>(initial);
  useSocketEvent<{ me: Me }>('me:updated', (p) => setMe(p.me));
  return <SessionCtx.Provider value={{ me, setMe }}>{children}</SessionCtx.Provider>;
}

export function useMe() {
  const ctx = useContext(SessionCtx);
  if (!ctx) throw new Error('useMe must be used inside SessionProvider');
  return ctx;
}
