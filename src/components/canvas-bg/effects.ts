// Canvas background effects, ported from Co-Bid-screen (bidmanage/frontend customBgEffects.ts).
// Changes: colors come from a callback (so they follow the light/dark theme live), an overall
// intensity scales every alpha, drawing can pause, and reduced-motion users get one still frame.

export type RGB = [number, number, number];
export type Palette = { bg: RGB; fg: RGB };
export type EffectName = 'orbit' | 'rain' | 'circuit';
export type EffectInstance = { destroy: () => void; setPaused: (paused: boolean) => void };
export type EffectOptions = { palette: () => Palette; intensity: number; still: boolean };

const rgba = ([r, g, b]: RGB, a: number) => `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, a))})`;

function setupCanvas(el: HTMLElement) {
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;';
  el.appendChild(canvas);
  const ctx = canvas.getContext('2d')!;
  const resize = () => {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor((el.clientWidth || window.innerWidth) * dpr);
    canvas.height = Math.floor((el.clientHeight || window.innerHeight) * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(el);
  return {
    ctx,
    width: () => el.clientWidth || window.innerWidth,
    height: () => el.clientHeight || window.innerHeight,
    cleanup: () => {
      ro.disconnect();
      canvas.remove();
    },
  };
}

/** Shared animation loop: frame(dt) draws; supports pausing and a single still frame. */
function loop(frame: (dt: number) => void, still: boolean, cleanup: () => void): EffectInstance {
  let raf = 0;
  let last = performance.now();
  let paused = false;
  const tick = (now: number) => {
    const dt = Math.min(80, now - last) / 1000;
    last = now;
    frame(dt);
    if (!still && !paused) raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return {
    setPaused: (p) => {
      if (still || p === paused) return;
      paused = p;
      cancelAnimationFrame(raf);
      if (!p) {
        last = performance.now();
        raf = requestAnimationFrame(tick);
      }
    },
    destroy: () => {
      cancelAnimationFrame(raf);
      cleanup();
    },
  };
}

/* Orbit: concentric circles with particles traveling along them */
function orbit(el: HTMLElement, o: EffectOptions): EffectInstance {
  const { ctx, width, height, cleanup } = setupCanvas(el);
  const RINGS = 28;
  const particles = Array.from({ length: 80 }, () => ({
    ring: Math.floor(Math.random() * RINGS),
    phase: Math.random() * Math.PI * 2,
    speed: 0.2 + Math.random() * 0.6,
  }));
  let t = 0;
  return loop(
    (dt) => {
      t += dt;
      const { bg, fg } = o.palette();
      const w = width();
      const h = height();
      ctx.fillStyle = rgba(bg, 1);
      ctx.fillRect(0, 0, w, h);
      const cx = w * 0.5;
      const cy = h * 0.5;
      const maxR = Math.hypot(w, h) * 0.7;
      ctx.lineWidth = 1;
      for (let i = 1; i < RINGS; i++) {
        ctx.strokeStyle = rgba(fg, (i % 4 === 0 ? 0.3 : 0.15) * o.intensity);
        ctx.beginPath();
        ctx.arc(cx, cy, (i / RINGS) * maxR, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.fillStyle = rgba(fg, 0.9 * o.intensity);
      for (const p of particles) {
        const r = (p.ring / RINGS) * maxR;
        const a = p.phase + t * p.speed;
        ctx.beginPath();
        ctx.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 1.6, 0, Math.PI * 2);
        ctx.fill();
      }
    },
    o.still,
    cleanup,
  );
}

/* Rain: diagonal falling streaks */
function rain(el: HTMLElement, o: EffectOptions): EffectInstance {
  const { ctx, width, height, cleanup } = setupCanvas(el);
  const angle = (70 * Math.PI) / 180;
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const streaks = Array.from({ length: 120 }, () => ({
    x: Math.random() * (width() + 400) - 200,
    y: Math.random() * height() - (o.still ? 0 : height()),
    len: 12 + Math.random() * 42,
    speed: 80 + Math.random() * 180,
  }));
  return loop(
    (dt) => {
      const { bg, fg } = o.palette();
      const w = width();
      const h = height();
      ctx.fillStyle = rgba(bg, 1);
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = rgba(fg, 0.45 * o.intensity);
      ctx.lineCap = 'round';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (const s of streaks) {
        s.x += dx * s.speed * dt;
        s.y += dy * s.speed * dt;
        if (s.y > h + 60 || s.x > w + 60) {
          s.x = Math.random() * (w + 200) - 200;
          s.y = -60 - Math.random() * 200;
        }
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(s.x - dx * s.len, s.y - dy * s.len);
      }
      ctx.stroke();
    },
    o.still,
    cleanup,
  );
}

/* Circuit: right-angle traces with pulsing nodes */
function circuit(el: HTMLElement, o: EffectOptions): EffectInstance {
  const { ctx, width, height, cleanup } = setupCanvas(el);
  type Path = { pts: { x: number; y: number }[]; lens: number[]; total: number; phase: number; speed: number };
  const build = (): Path => {
    const pts = [{ x: Math.random() * width(), y: Math.random() * height() }];
    const segs = 3 + Math.floor(Math.random() * 4);
    let horiz = Math.random() < 0.5;
    for (let s = 0; s < segs; s++) {
      const len = 50 + Math.random() * 160;
      const sign = Math.random() < 0.5 ? -1 : 1;
      const prev = pts[pts.length - 1];
      pts.push(horiz ? { x: prev.x + len * sign, y: prev.y } : { x: prev.x, y: prev.y + len * sign });
      horiz = !horiz;
    }
    const lens: number[] = [];
    let total = 0;
    for (let i = 1; i < pts.length; i++) {
      const d = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
      lens.push(d);
      total += d;
    }
    return { pts, lens, total, phase: Math.random(), speed: 0.08 + Math.random() * 0.18 };
  };
  const paths: Path[] = Array.from({ length: 26 }, build);
  let rebuildAt = performance.now() + 8000 + Math.random() * 8000;

  return loop(
    (dt) => {
      const now = performance.now();
      if (now >= rebuildAt) {
        paths[Math.floor(Math.random() * paths.length)] = build();
        rebuildAt = now + 4000 + Math.random() * 6000;
      }
      const { bg, fg } = o.palette();
      ctx.fillStyle = rgba(bg, 1);
      ctx.fillRect(0, 0, width(), height());
      for (const p of paths) {
        ctx.strokeStyle = rgba(fg, 0.3 * o.intensity);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(p.pts[0].x, p.pts[0].y);
        for (let i = 1; i < p.pts.length; i++) ctx.lineTo(p.pts[i].x, p.pts[i].y);
        ctx.stroke();

        ctx.fillStyle = rgba(fg, 0.6 * o.intensity);
        ctx.fillRect(p.pts[0].x - 2, p.pts[0].y - 2, 4, 4);
        const end = p.pts[p.pts.length - 1];
        ctx.fillRect(end.x - 2, end.y - 2, 4, 4);

        p.phase = (p.phase + p.speed * dt) % 1;
        let dist = p.phase * p.total;
        let x = p.pts[0].x;
        let y = p.pts[0].y;
        for (let i = 1; i < p.pts.length; i++) {
          const segLen = p.lens[i - 1];
          if (dist <= segLen) {
            const k = dist / segLen;
            x = p.pts[i - 1].x + (p.pts[i].x - p.pts[i - 1].x) * k;
            y = p.pts[i - 1].y + (p.pts[i].y - p.pts[i - 1].y) * k;
            break;
          }
          dist -= segLen;
        }
        ctx.fillStyle = rgba(fg, o.intensity);
        ctx.beginPath();
        ctx.arc(x, y, 2.4, 0, Math.PI * 2);
        ctx.fill();
      }
    },
    o.still,
    cleanup,
  );
}

export const EFFECTS: Record<EffectName, (el: HTMLElement, o: EffectOptions) => EffectInstance> = { orbit, rain, circuit };
