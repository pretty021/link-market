'use client';

import { createContext, useCallback, useContext, useState } from 'react';
import { CheckCircle2, Info, TriangleAlert, X } from 'lucide-react';
import { cn } from '@/lib/utils';

type Tone = 'success' | 'error' | 'info';
type Toast = { id: number; title: string; body?: string; tone: Tone; onClick?: () => void };
type ToastFn = (t: { title: string; body?: string; tone?: Tone; onClick?: () => void }) => void;

const Ctx = createContext<ToastFn>(() => undefined);
export const useToast = () => useContext(Ctx);

let seq = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const dismiss = (id: number) => setToasts((t) => t.filter((x) => x.id !== id));
  const push = useCallback<ToastFn>((t) => {
    const id = ++seq;
    setToasts((prev) => [...prev.slice(-3), { id, tone: t.tone ?? 'info', ...t }]);
    setTimeout(() => dismiss(id), 5000);
  }, []);

  return (
    <Ctx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[min(380px,calc(100vw-2rem))] flex-col gap-2" aria-live="polite">
        {toasts.map((t) => {
          const Icon = t.tone === 'success' ? CheckCircle2 : t.tone === 'error' ? TriangleAlert : Info;
          return (
            <div
              key={t.id}
              role="status"
              onClick={() => {
                t.onClick?.();
                if (t.onClick) dismiss(t.id);
              }}
              className={cn(
                'panel pointer-events-auto flex items-start gap-3 p-4 animate-in slide-in-from-bottom-2 fade-in-0',
                t.onClick && 'cursor-pointer hover:border-brand-mint/50',
              )}
            >
              <Icon
                className={cn(
                  'mt-0.5 size-5 shrink-0',
                  t.tone === 'success' ? 'text-brand-mint' : t.tone === 'error' ? 'text-state-err' : 'text-brand-purpleSoft',
                )}
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-ink-hi">{t.title}</p>
                {t.body && <p className="mt-0.5 line-clamp-2 break-words text-xs text-ink-mid">{t.body}</p>}
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  dismiss(t.id);
                }}
                className="text-ink-lo hover:text-ink-hi"
                aria-label="Dismiss"
              >
                <X className="size-4" />
              </button>
            </div>
          );
        })}
      </div>
    </Ctx.Provider>
  );
}
