import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/db';
import { resolveSession } from '@/lib/auth';
import { POST as loginRoute } from '@/app/api/auth/login/route';
import { GET as meRoute } from '@/app/api/me/route';
import { changePassword, login, registerCustomer, setBlocked, softDeleteUser } from '@/server/services/users';
import { PASSWORD, apiRequest, makeAdmin, makeClient, makeCustomer, resetDb } from './helpers';

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

const meta = {};

describe('login', () => {
  it('logs in an Admin from the Admin table and a User from the User table', async () => {
    const admin = await makeAdmin();
    const client = await makeClient();
    expect((await login(admin.email, PASSWORD, meta)).me.kind).toBe('admin');
    const res = await login(client.email, PASSWORD, meta);
    expect(res.me).toMatchObject({ kind: 'user', role: 'CLIENT' });
    expect(await resolveSession(res.token)).toMatchObject({ kind: 'user', id: client.id, role: 'CLIENT' });
  });

  it('stores only the SHA-256 hash of the session token and sets an httpOnly cookie', async () => {
    const c = await makeCustomer();
    const res = await loginRoute(apiRequest('/api/auth/login', { method: 'POST', json: { email: c.email, password: PASSWORD } }), {
      params: {},
    });
    expect(res.status).toBe(200);
    const cookie = res.headers.get('set-cookie')!;
    expect(cookie).toMatch(/lm_session=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=lax/i);
    const token = /lm_session=([^;]+)/.exec(cookie)![1];
    const session = await prisma.session.findFirstOrThrow({ where: { userId: c.id } });
    expect(session.tokenHash).not.toBe(token);
    expect(session.tokenHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('rejects a wrong password', async () => {
    const c = await makeCustomer();
    await expect(login(c.email, 'wrong-password', meta)).rejects.toMatchObject({ status: 401 });
    await expect(login('nobody@test.dev', PASSWORD, meta)).rejects.toMatchObject({ status: 401 });
  });

  it('a self-registered Customer can log in immediately', async () => {
    const reg = await registerCustomer({ name: 'New Buyer', email: 'new@test.dev', password: 'longenough1' }, meta);
    expect(reg.me).toMatchObject({ role: 'CUSTOMER', b_counts: 0, cartLimit: 1 });
    expect((await login('new@test.dev', 'longenough1', meta)).me.kind).toBe('user');
    await expect(
      registerCustomer({ name: 'Dup', email: 'new@test.dev', password: 'longenough1' }, meta),
    ).rejects.toMatchObject({ code: 'EMAIL_TAKEN' });
  });

  it('changing the password requires the current password', async () => {
    const c = await makeCustomer();
    await expect(changePassword(c, 'not-it', 'newpassword1')).rejects.toMatchObject({ code: 'WRONG_PASSWORD' });
    await changePassword(c, PASSWORD, 'newpassword1');
    await expect(login(c.email, PASSWORD, meta)).rejects.toMatchObject({ status: 401 });
    expect((await login(c.email, 'newpassword1', meta)).me.kind).toBe('user');
  });
});

describe('blocking and session revocation', () => {
  it('blocking revokes every session immediately and prevents login', async () => {
    const c = await makeCustomer();
    const s1 = await login(c.email, PASSWORD, meta);
    const s2 = await login(c.email, PASSWORD, meta);
    const cookie = `lm_session=${s1.token}`;
    expect((await meRoute(apiRequest('/api/me', { cookie }), { params: {} })).status).toBe(200);

    await setBlocked(c.id, true);

    expect(await resolveSession(s1.token)).toBeNull();
    expect(await resolveSession(s2.token)).toBeNull();
    expect(await prisma.session.count({ where: { userId: c.id, revokedAt: null } })).toBe(0);
    expect((await meRoute(apiRequest('/api/me', { cookie }), { params: {} })).status).toBe(401);
    await expect(login(c.email, PASSWORD, meta)).rejects.toMatchObject({ status: 403, code: 'BLOCKED' });

    await setBlocked(c.id, false);
    expect((await login(c.email, PASSWORD, meta)).me.kind).toBe('user');
    // Old sessions stay revoked after unblocking.
    expect(await resolveSession(s1.token)).toBeNull();
  });

  it('soft-deleted users cannot log in and lose their sessions', async () => {
    const client = await makeClient();
    const s = await login(client.email, PASSWORD, meta);
    await softDeleteUser(client.id);
    expect(await resolveSession(s.token)).toBeNull();
    await expect(login(client.email, PASSWORD, meta)).rejects.toMatchObject({ status: 401 });
    expect(await prisma.user.findUnique({ where: { id: client.id } })).not.toBeNull();
  });
});
