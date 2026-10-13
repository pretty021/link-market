import { createHash, randomInt } from 'node:crypto';
import { prisma } from '@/lib/db';
import { HttpError, badRequest } from '@/lib/errors';
import { assertMailDomain } from '@/server/email-domain';
import { sendMail } from '@/server/mailer';
import { assertEmailFree } from './users';

export const CODE_TTL_MS = 10 * 60_000;
export const RESEND_MS = 60_000;
export const MAX_ATTEMPTS = 5;

const hashCode = (email: string, code: string) => createHash('sha256').update(`${email}:${code}`).digest('hex');

/** Emails a 6-digit sign-up code. A new code replaces the old one (at most one per minute). */
export async function sendSignupCode(email: string) {
  await assertEmailFree(email);
  await assertMailDomain(email);

  const existing = await prisma.emailCode.findUnique({ where: { email } });
  const wait = existing ? existing.sentAt.getTime() + RESEND_MS - Date.now() : 0;
  if (wait > 0) {
    const seconds = Math.ceil(wait / 1000);
    throw new HttpError(429, 'CODE_WAIT', `Wait ${seconds}s before sending a new code.`, { resendIn: seconds });
  }

  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  const now = new Date();
  const row = { codeHash: hashCode(email, code), attempts: 0, expiresAt: new Date(now.getTime() + CODE_TTL_MS), sentAt: now };
  await prisma.emailCode.upsert({ where: { email }, create: { email, ...row }, update: row });

  try {
    await sendMail({
      to: email,
      subject: `${code} is your inonlink code`,
      text: `Your inonlink sign-up code is ${code}\n\nIt expires in 10 minutes. If you did not try to sign up, ignore this email.`,
      html: `<div style="font-family:Arial,sans-serif;font-size:15px;color:#1d2226">
  <p>Your inonlink sign-up code:</p>
  <p style="font-size:30px;font-weight:700;letter-spacing:6px;color:#0A66C2;margin:16px 0">${code}</p>
  <p style="color:#666">It expires in 10 minutes. If you did not try to sign up, ignore this email.</p>
</div>`,
    });
  } catch (e) {
    await prisma.emailCode.deleteMany({ where: { email } }); // allow an immediate retry
    throw e;
  }
  return { resendIn: RESEND_MS / 1000, expiresIn: CODE_TTL_MS / 1000 };
}

/** Checks and uses up a sign-up code. Every guess counts toward MAX_ATTEMPTS. */
export async function consumeSignupCode(email: string, code: string) {
  // Count the guess first (atomically), so parallel guesses can't exceed the limit.
  const counted = await prisma.emailCode.updateMany({
    where: { email, attempts: { lt: MAX_ATTEMPTS }, expiresAt: { gt: new Date() } },
    data: { attempts: { increment: 1 } },
  });
  if (counted.count === 0) {
    const row = await prisma.emailCode.findUnique({ where: { email } });
    if (row && row.expiresAt > new Date()) throw badRequest('CODE_LOCKED', 'Too many tries. Send a new code.');
    throw badRequest('CODE_EXPIRED', 'Code expired. Send a new one.');
  }
  const used = await prisma.emailCode.deleteMany({ where: { email, codeHash: hashCode(email, code) } });
  if (used.count === 0) throw badRequest('CODE_WRONG', 'Wrong code. Check your email and try again.');
}
