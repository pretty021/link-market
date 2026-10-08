import { NextResponse, type NextRequest } from 'next/server';
import { ZodError, type ZodSchema } from 'zod';
import { HttpError, forbidden, unauthorized } from './errors';
import { SESSION_COOKIE, resolveSession } from './auth';
import type { Actor, AdminActor, UserActor } from './actor';

type Ctx = { params: Record<string, string> };
type Handler = (req: NextRequest, ctx: Ctx) => Promise<Response | unknown>;

export function route(handler: Handler) {
  return async (req: NextRequest, ctx: Ctx) => {
    try {
      const result = await handler(req, ctx ?? { params: {} });
      if (result instanceof Response) return result;
      return NextResponse.json(result ?? { ok: true });
    } catch (err) {
      if (err instanceof HttpError) {
        return NextResponse.json(
          { code: err.code, message: err.message, ...(err.data ?? {}) },
          { status: err.status },
        );
      }
      if (err instanceof ZodError) {
        return NextResponse.json(
          { code: 'VALIDATION_ERROR', message: err.issues[0]?.message ?? 'Invalid input', issues: err.issues },
          { status: 400 },
        );
      }
      console.error(err);
      return NextResponse.json({ code: 'INTERNAL', message: 'Something went wrong.' }, { status: 500 });
    }
  };
}

export async function body<T>(req: NextRequest, schema: ZodSchema<T>): Promise<T> {
  let raw: unknown = {};
  try {
    raw = await req.json();
  } catch {
    raw = {};
  }
  return schema.parse(raw);
}

export function query<T>(req: NextRequest, schema: ZodSchema<T>): T {
  return schema.parse(Object.fromEntries(req.nextUrl.searchParams.entries()));
}

export async function getActor(req: NextRequest): Promise<Actor | null> {
  return resolveSession(req.cookies.get(SESSION_COOKIE)?.value);
}

export async function requireActor(req: NextRequest): Promise<Actor> {
  const a = await getActor(req);
  if (!a) throw unauthorized();
  return a;
}

export async function requireAdmin(req: NextRequest): Promise<AdminActor> {
  const a = await requireActor(req);
  if (a.kind !== 'admin') throw forbidden();
  return a;
}

export async function requireClient(req: NextRequest): Promise<UserActor> {
  const a = await requireActor(req);
  if (a.kind !== 'user' || a.role !== 'CLIENT') throw forbidden();
  return a;
}

export async function requireCustomer(req: NextRequest): Promise<UserActor> {
  const a = await requireActor(req);
  if (a.kind !== 'user' || a.role !== 'CUSTOMER') throw forbidden();
  return a;
}

export function requestMeta(req: NextRequest) {
  return {
    userAgent: req.headers.get('user-agent'),
    ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
  };
}

export function setSessionCookie(res: NextResponse, token: string, expiresAt: Date) {
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  });
}

export function clearSessionCookie(res: NextResponse) {
  res.cookies.set(SESSION_COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 });
}
