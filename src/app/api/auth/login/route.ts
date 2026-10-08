import { NextResponse } from 'next/server';
import { body, requestMeta, route, setSessionCookie } from '@/lib/http';
import { rateLimit } from '@/lib/rate-limit';
import { loginSchema } from '@/lib/validation';
import { login } from '@/server/services/users';

export const POST = route(async (req) => {
  const input = await body(req, loginSchema);
  const meta = requestMeta(req);
  rateLimit(`login:${meta.ip ?? 'unknown'}:${input.email}`, 10, 60_000);
  const { token, expiresAt, me } = await login(input.email, input.password, meta);
  const res = NextResponse.json({ me });
  setSessionCookie(res, token, expiresAt);
  return res;
});
