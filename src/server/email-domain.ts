import { resolveMx } from 'node:dns/promises';
import { badRequest } from '@/lib/errors';

// Throwaway inbox services. The code check already proves the inbox works; this keeps
// out addresses that are thrown away right after sign-up.
const DISPOSABLE = new Set([
  '10minutemail.com',
  'dispostable.com',
  'emailondeck.com',
  'fakeinbox.com',
  'getnada.com',
  'guerrillamail.com',
  'guerrillamail.net',
  'maildrop.cc',
  'mailinator.com',
  'mailnesia.com',
  'mintemail.com',
  'mohmal.com',
  'sharklasers.com',
  'temp-mail.org',
  'tempmail.com',
  'tempmail.net',
  'tempmailo.com',
  'throwawaymail.com',
  'trashmail.com',
  'yopmail.com',
]);

/** Rejects throwaway domains and domains that cannot receive mail (no MX record). */
export async function assertMailDomain(email: string) {
  const domain = email.split('@')[1] ?? '';
  if (DISPOSABLE.has(domain)) {
    throw badRequest('EMAIL_DISPOSABLE', 'Temporary email addresses are not allowed. Use your real email.');
  }
  try {
    const mx = await resolveMx(domain);
    if (mx.some((r) => r.exchange && r.exchange !== '.')) return;
  } catch (e) {
    const code = (e as { code?: string }).code;
    // DNS itself failed (offline, timeout): let the email code decide instead.
    if (code !== 'ENOTFOUND' && code !== 'ENODATA') return;
  }
  throw badRequest('EMAIL_DOMAIN', 'This email address cannot receive mail. Check it and try again.');
}
