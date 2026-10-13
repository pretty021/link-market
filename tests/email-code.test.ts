import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '@/lib/db';
import { MAX_ATTEMPTS, consumeSignupCode, sendSignupCode } from '@/server/services/email-codes';
import { registerCustomer } from '@/server/services/users';
import { makeCustomer, resetDb } from './helpers';

const mail = vi.hoisted(() => ({ sent: [] as { to: string; text: string }[] }));
vi.mock('@/server/mailer', () => ({ sendMail: async (m: { to: string; text: string }) => void mail.sent.push(m) }));
vi.mock('@/server/email-domain', () => ({ assertMailDomain: async () => {} }));

const lastCode = () => /\b(\d{6})\b/.exec(mail.sent.at(-1)!.text)![1]!;
const wrong = (code: string) => String((Number(code) + 1) % 1_000_000).padStart(6, '0');
const user = (email: string, code: string) => ({ name: 'Buyer', email, password: 'longenough1', code });

beforeEach(async () => {
  await resetDb();
  mail.sent = [];
});
afterAll(() => prisma.$disconnect());

describe('sign-up email code', () => {
  it('emails a 6-digit code and stores only its hash', async () => {
    await sendSignupCode('a@test.dev');
    expect(mail.sent).toHaveLength(1);
    expect(mail.sent[0]!.to).toBe('a@test.dev');
    const row = await prisma.emailCode.findUniqueOrThrow({ where: { email: 'a@test.dev' } });
    expect(row.codeHash).toMatch(/^[a-f0-9]{64}$/);
    expect(row.codeHash).not.toContain(lastCode());
  });

  it('creates the account only with the right code, and the code works once', async () => {
    await sendSignupCode('b@test.dev');
    const code = lastCode();
    await expect(registerCustomer(user('b@test.dev', wrong(code)), {})).rejects.toMatchObject({ code: 'CODE_WRONG' });
    expect(await prisma.user.count()).toBe(0);
    await registerCustomer(user('b@test.dev', code), {});
    expect(await prisma.user.count({ where: { email: 'b@test.dev' } })).toBe(1);
    expect(await prisma.emailCode.count()).toBe(0);
  });

  it('a code for one email does not work for another', async () => {
    await sendSignupCode('c@test.dev');
    await expect(registerCustomer(user('other@test.dev', lastCode()), {})).rejects.toMatchObject({ code: 'CODE_EXPIRED' });
  });

  it(`locks the code after ${MAX_ATTEMPTS} wrong tries`, async () => {
    await sendSignupCode('d@test.dev');
    const code = lastCode();
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      await expect(consumeSignupCode('d@test.dev', wrong(code))).rejects.toMatchObject({ code: 'CODE_WRONG' });
    }
    await expect(consumeSignupCode('d@test.dev', code)).rejects.toMatchObject({ code: 'CODE_LOCKED' });
  });

  it('parallel guesses cannot go past the limit', async () => {
    await sendSignupCode('e@test.dev');
    const code = lastCode();
    await Promise.allSettled(Array.from({ length: 20 }, () => consumeSignupCode('e@test.dev', wrong(code))));
    expect((await prisma.emailCode.findUniqueOrThrow({ where: { email: 'e@test.dev' } })).attempts).toBe(MAX_ATTEMPTS);
  });

  it('rejects an expired code', async () => {
    await sendSignupCode('f@test.dev');
    await prisma.emailCode.update({ where: { email: 'f@test.dev' }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await expect(consumeSignupCode('f@test.dev', lastCode())).rejects.toMatchObject({ code: 'CODE_EXPIRED' });
  });

  it('waits a minute between codes, and a new code replaces the old one', async () => {
    await sendSignupCode('g@test.dev');
    const first = lastCode();
    await expect(sendSignupCode('g@test.dev')).rejects.toMatchObject({ status: 429, code: 'CODE_WAIT' });
    await prisma.emailCode.update({ where: { email: 'g@test.dev' }, data: { sentAt: new Date(Date.now() - 61_000) } });
    await sendSignupCode('g@test.dev');
    const second = lastCode();
    if (second !== first) {
      await expect(consumeSignupCode('g@test.dev', first)).rejects.toMatchObject({ code: 'CODE_WRONG' });
    }
    await consumeSignupCode('g@test.dev', second);
  });

  it('does not send a code to an email that already has an account', async () => {
    const c = await makeCustomer();
    await expect(sendSignupCode(c.email)).rejects.toMatchObject({ code: 'EMAIL_TAKEN' });
    expect(mail.sent).toHaveLength(0);
  });
});
