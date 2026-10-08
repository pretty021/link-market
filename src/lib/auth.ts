import { createHash, randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { prisma } from './db';
import type { Actor } from './actor';

export const SESSION_COOKIE = 'lm_session';
export const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;

export const hashPassword = (plain: string) => bcrypt.hash(plain, 12);
export const verifyPassword = (plain: string, hash: string) => bcrypt.compare(plain, hash);

export function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export function newToken() {
  return randomBytes(32).toString('base64url');
}

export async function createSession(
  owner: { kind: 'admin' | 'user'; id: string },
  meta: { userAgent?: string | null; ip?: string | null } = {},
) {
  const token = newToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await prisma.session.create({
    data: {
      tokenHash: hashToken(token),
      userId: owner.kind === 'user' ? owner.id : null,
      adminId: owner.kind === 'admin' ? owner.id : null,
      userAgent: meta.userAgent ?? null,
      ip: meta.ip ?? null,
      expiresAt,
    },
  });
  return { token, expiresAt };
}

export async function resolveSession(token: string | undefined | null): Promise<Actor | null> {
  if (!token) return null;
  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true, admin: true },
  });
  if (!session || session.revokedAt || session.expiresAt <= new Date()) return null;
  if (session.admin) {
    return { kind: 'admin', id: session.admin.id, name: session.admin.name, email: session.admin.email };
  }
  const u = session.user;
  if (!u || u.isBlocked || u.deletedAt) return null;
  return { kind: 'user', id: u.id, role: u.role, name: u.name, email: u.email };
}

export async function revokeSession(token: string) {
  await prisma.session.updateMany({
    where: { tokenHash: hashToken(token), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function revokeAllUserSessions(userId: string) {
  await prisma.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
}

export function parseCookie(header: string | undefined, name: string) {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === name) return decodeURIComponent(part.slice(idx + 1).trim());
  }
  return undefined;
}
