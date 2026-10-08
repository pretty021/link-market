import { HttpError } from './errors';

const g = globalThis as unknown as { __rate?: Map<string, number[]> };
const hits: Map<string, number[]> = (g.__rate ??= new Map());

/** Sliding-window limiter (single process). Throws 429 when `limit` hits occur within `windowMs`. */
export function rateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    hits.set(key, recent);
    throw new HttpError(429, 'RATE_LIMITED', 'Too many requests. Please wait a moment.');
  }
  recent.push(now);
  hits.set(key, recent);
}
