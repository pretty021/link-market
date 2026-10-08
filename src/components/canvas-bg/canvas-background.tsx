'use client';

import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { EFFECTS, type EffectName, type Palette, type RGB } from './effects';

const ALL: EffectName[] = ['orbit', 'rain', 'circuit'];

function readVar(name: string): RGB {
  const parts = getComputedStyle(document.documentElement).getPropertyValue(name).trim().split(/\s+/).map(Number);
  return parts.length === 3 && parts.every((n) => Number.isFinite(n)) ? (parts as RGB) : [128, 128, 128];
}

/**
 * Animated canvas background from Co-Bid-screen. Picks one effect at random per visit (like the
 * original) unless `effect` is given, draws in the theme's colors and follows the theme toggle live.
 * Pauses while scrolled out of view; reduced-motion users get a single still frame.
 */
export function CanvasBackground({ effect, intensity = 0.55, className }: { effect?: EffectName; intensity?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const name = effect ?? ALL[Math.floor(Math.random() * ALL.length)];
    el.dataset.effect = name;

    let palette: Palette = { bg: readVar('--bg-deep'), fg: readVar('--mint') };
    const themeObserver = new MutationObserver(() => {
      palette = { bg: readVar('--bg-deep'), fg: readVar('--mint') };
    });
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let instance: ReturnType<(typeof EFFECTS)[EffectName]> | null = null;
    try {
      instance = EFFECTS[name](el, { palette: () => palette, intensity, still });
    } catch (err) {
      console.warn(`[CanvasBackground] effect "${name}" failed:`, err);
    }

    const io = new IntersectionObserver(([entry]) => instance?.setPaused(!entry.isIntersecting));
    io.observe(el);

    return () => {
      io.disconnect();
      themeObserver.disconnect();
      instance?.destroy();
    };
  }, [effect, intensity]);

  return <div ref={ref} aria-hidden="true" className={cn('pointer-events-none absolute inset-0 overflow-hidden', className)} />;
}
