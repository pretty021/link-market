'use client';

import { syncClock } from './clock';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public data: Record<string, unknown>,
  ) {
    super(message);
  }
}

export async function api<T = Record<string, unknown>>(
  path: string,
  init: { method?: string; json?: unknown; form?: FormData } = {},
): Promise<T> {
  const res = await fetch(path, {
    method: init.method ?? (init.json !== undefined || init.form ? 'POST' : 'GET'),
    headers: init.json !== undefined ? { 'content-type': 'application/json' } : undefined,
    body: init.form ?? (init.json !== undefined ? JSON.stringify(init.json) : undefined),
    credentials: 'same-origin',
    cache: 'no-store',
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (typeof data.serverNow === 'string') syncClock(data.serverNow);
  if (!res.ok) {
    if (res.status === 401 && typeof window !== 'undefined' && !path.startsWith('/api/auth')) {
      window.location.href = '/login';
    }
    throw new ApiError(res.status, String(data.code ?? 'ERROR'), String(data.message ?? 'Request failed.'), data);
  }
  return data as T;
}
