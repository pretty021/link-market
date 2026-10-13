import { NextResponse } from 'next/server';
import { body, requestMeta, route, setSessionCookie } from '@/lib/http';
import { rateLimit } from '@/lib/rate-limit';
import { registerSchema } from '@/lib/validation';
import { registerCustomer } from '@/server/services/users';

export const POST = route(async (req) => {
  const input = await body(req, registerSchema);
  const meta = requestMeta(req);
  rateLimit(`register:${meta.ip ?? 'unknown'}`, 20, 60 * 60_000);
  const { token, expiresAt, me } = await registerCustomer(input, meta);
  const res = NextResponse.json({ me }, { status: 201 });
  setSessionCookie(res, token, expiresAt);
  return res;
});
