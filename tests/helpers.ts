import bcrypt from 'bcryptjs';
import { NextRequest } from 'next/server';
import type { Role } from '@prisma/client';
import { prisma } from '@/lib/db';
import { SESSION_COOKIE, createSession } from '@/lib/auth';
import type { AdminActor, UserActor } from '@/lib/actor';

export const PASSWORD = 'password123';
const passwordHash = bcrypt.hashSync(PASSWORD, 4);
let seq = 0;

export async function resetDb() {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(', ')} CASCADE`);
}

export async function makeAdmin(): Promise<AdminActor> {
  const a = await prisma.admin.create({ data: { email: `admin${++seq}@test.dev`, passwordHash, name: 'Admin' } });
  return { kind: 'admin', id: a.id, name: a.name, email: a.email };
}

export async function makeUser(role: Role, extra: { cartLimit?: number; name?: string } = {}): Promise<UserActor> {
  const n = ++seq;
  const u = await prisma.user.create({
    data: {
      role,
      name: extra.name ?? `${role === 'CLIENT' ? 'Client' : 'Customer'} ${n}`,
      email: `${role.toLowerCase()}${n}@test.dev`,
      passwordHash,
      ...(extra.cartLimit !== undefined ? { cartLimit: extra.cartLimit } : {}),
    },
  });
  return { kind: 'user', id: u.id, role: u.role, name: u.name, email: u.email };
}

export const makeClient = () => makeUser('CLIENT');
export const makeCustomer = (cartLimit?: number) => makeUser('CUSTOMER', { cartLimit });

/** A post that already went through request -> save price -> accept. */
export async function makePublishedPost(clientId: string, title = 'Test post') {
  return prisma.post.create({
    data: { clientId, title, status: 'PUBLISHED', approval: true, price: 35.01, connects: 3 },
  });
}

export async function addToCartDirect(customerId: string, postId: string) {
  await prisma.cartItem.create({ data: { customerId, postId } });
}

/** Moves a PROGRESSING post's deadline to `ms` from the database's now(). */
export async function setExpiresIn(postId: string, ms: number) {
  await prisma.$executeRaw`
    UPDATE "Post" SET "progressingExpiresAt" = (clock_timestamp() AT TIME ZONE 'UTC') + make_interval(secs => ${ms / 1000}::float8)
    WHERE id = ${postId}`;
}

export async function sessionCookie(owner: { kind: 'admin' | 'user'; id: string }) {
  const { token } = await createSession(owner);
  return `${SESSION_COOKIE}=${token}`;
}

export function apiRequest(path: string, init: { method?: string; cookie?: string; json?: unknown } = {}) {
  return new NextRequest(new URL(path, 'http://localhost'), {
    method: init.method ?? 'GET',
    headers: {
      ...(init.cookie ? { cookie: init.cookie } : {}),
      ...(init.json !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    body: init.json !== undefined ? JSON.stringify(init.json) : undefined,
  });
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Sends checking info the way the app does: with one of the seller's payment addresses (made if missing). */
export async function submitPaidCheck(customer: UserActor, postId: string, url: string) {
  const { submitCheck } = await import('@/server/services/checks');
  const post = await prisma.post.findUniqueOrThrow({ where: { id: postId }, select: { clientId: true } });
  const pay =
    (await prisma.paymentAddress.findFirst({ where: { clientId: post.clientId } })) ??
    (await prisma.paymentAddress.create({ data: { clientId: post.clientId, type: 'USDT TRC20', address: 'TTestAddress' } }));
  return submitCheck(customer, postId, url, pay.id);
}
