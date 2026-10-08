import { NextResponse } from 'next/server';
import { SESSION_COOKIE, revokeSession } from '@/lib/auth';
import { clearSessionCookie, route } from '@/lib/http';

export const POST = route(async (req) => {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (token) await revokeSession(token);
  const res = NextResponse.json({ ok: true });
  clearSessionCookie(res);
  return res;
});
