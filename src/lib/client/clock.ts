'use client';

import { useEffect, useState } from 'react';

// Difference between the database clock and this browser's clock. Every API response and
// socket event carries serverNow, so countdowns never trust the local clock.
let offsetMs = 0;

export function syncClock(serverNow: string | Date) {
  const t = new Date(serverNow).getTime();
  if (!Number.isNaN(t)) offsetMs = t - Date.now();
}

export function serverNowMs() {
  return Date.now() + offsetMs;
}

export function remainingMs(expiresAt: string | Date | null | undefined) {
  if (!expiresAt) return 0;
  return Math.max(0, new Date(expiresAt).getTime() - serverNowMs());
}

export function formatMmSs(ms: number) {
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** Live mm:ss for a deadline; calls onDone once when it reaches zero. */
export function useCountdown(expiresAt: string | Date | null | undefined, onDone?: () => void) {
  const [ms, setMs] = useState(() => remainingMs(expiresAt));
  useEffect(() => {
    if (!expiresAt) {
      setMs(0);
      return;
    }
    let fired = false;
    const tick = () => {
      const left = remainingMs(expiresAt);
      setMs(left);
      if (left <= 0 && !fired) {
        fired = true;
        onDone?.();
      }
    };
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expiresAt ? new Date(expiresAt).getTime() : null]);
  return { ms, label: formatMmSs(ms), done: ms <= 0 };
}
