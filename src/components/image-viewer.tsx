'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Maximize2, X, ZoomIn, ZoomOut } from 'lucide-react';

const MIN = 1;
const MAX = 6;
const STEP = 1.5;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * Full-screen photo viewer: zoom with the buttons, the mouse wheel, a double click or two fingers,
 * and drag to move around a zoomed picture. Esc or the X closes it.
 */
export function ImageViewer({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  const [view, setView] = useState({ scale: 1, x: 0, y: 0 });
  const { scale } = view;
  const [dragging, setDragging] = useState(false);
  const stage = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; scale: number } | null>(null);
  const last = useRef<{ x: number; y: number } | null>(null);

  // Zoom toward a point on screen (the cursor, or the middle for the buttons).
  const zoomTo = useCallback((next: number, at?: { x: number; y: number }) => {
    const box = stage.current?.getBoundingClientRect();
    setView((v) => {
      const target = clamp(next, MIN, MAX);
      if (target === MIN) return { scale: MIN, x: 0, y: 0 };
      const k = target / v.scale;
      // Keep the point under the cursor in place; the buttons zoom around the middle.
      const cx = box && at ? at.x - (box.left + box.width / 2) : 0;
      const cy = box && at ? at.y - (box.top + box.height / 2) : 0;
      return { scale: target, x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k };
    });
  }, []);

  const reset = useCallback(() => setView({ scale: 1, x: 0, y: 0 }), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === '+' || e.key === '=') zoomTo(scale * STEP);
      else if (e.key === '-') zoomTo(scale / STEP);
      else if (e.key === '0') reset();
    };
    window.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose, reset, scale, zoomTo]);

  // Wheel zoom needs a non-passive listener so the page doesn't scroll.
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoomTo(scale * (e.deltaY < 0 ? 1.2 : 1 / 1.2), { x: e.clientX, y: e.clientY });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [scale, zoomTo]);

  function onPointerDown(e: React.PointerEvent) {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { dist: Math.hypot(a!.x - b!.x, a!.y - b!.y), scale };
      last.current = null;
    } else {
      last.current = { x: e.clientX, y: e.clientY };
      setDragging(scale > 1);
    }
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch.current && pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      zoomTo((pinch.current.scale * dist) / pinch.current.dist, { x: (a!.x + b!.x) / 2, y: (a!.y + b!.y) / 2 });
      return;
    }
    if (last.current && scale > 1) {
      const dx = e.clientX - last.current.x;
      const dy = e.clientY - last.current.y;
      last.current = { x: e.clientX, y: e.clientY };
      setView((v) => ({ ...v, x: v.x + dx, y: v.y + dy }));
    }
  }

  function onPointerUp(e: React.PointerEvent) {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (pointers.current.size === 0) {
      last.current = null;
      setDragging(false);
    }
  }

  const button =
    'flex size-10 items-center justify-center rounded-full text-white transition hover:bg-white/15 disabled:opacity-40 disabled:hover:bg-transparent [&_svg]:size-5';

  return createPortal(
    <div className="fixed inset-0 z-[100] flex flex-col bg-black/90 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={alt}>
      <div className="flex items-center justify-between gap-3 px-4 py-3 text-white">
        <p className="min-w-0 truncate text-sm font-semibold">{alt}</p>
        <button type="button" onClick={onClose} className={button} aria-label="Close" title="Close (Esc)">
          <X />
        </button>
      </div>

      <div
        ref={stage}
        className="relative min-h-0 flex-1 touch-none select-none overflow-hidden"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={(e) => (scale > 1 ? reset() : zoomTo(2.5, { x: e.clientX, y: e.clientY }))}
        onClick={(e) => e.target === e.currentTarget && scale === 1 && onClose()}
        style={{ cursor: scale > 1 ? (dragging ? 'grabbing' : 'grab') : 'zoom-in' }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt}
          draggable={false}
          className="absolute inset-0 m-auto max-h-full max-w-full object-contain p-2 sm:p-6"
          style={{
            transform: `translate(${view.x}px, ${view.y}px) scale(${scale})`,
            transition: dragging || pinch.current ? 'none' : 'transform 150ms ease-out',
          }}
        />
      </div>

      <div className="flex justify-center px-4 pb-5 pt-3">
        <div className="flex items-center gap-1 rounded-full border border-white/15 bg-white/10 px-2 py-1.5 shadow-lift">
          <button type="button" onClick={() => zoomTo(scale / STEP)} disabled={scale <= MIN} className={button} aria-label="Zoom out" title="Zoom out (-)">
            <ZoomOut />
          </button>
          <span className="w-14 text-center text-sm font-semibold tabular-nums text-white">{Math.round(scale * 100)}%</span>
          <button type="button" onClick={() => zoomTo(scale * STEP)} disabled={scale >= MAX} className={button} aria-label="Zoom in" title="Zoom in (+)">
            <ZoomIn />
          </button>
          <span className="mx-1 h-6 w-px bg-white/20" />
          <button type="button" onClick={reset} disabled={scale === 1} className={button} aria-label="Fit to screen" title="Fit to screen (0)">
            <Maximize2 />
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
