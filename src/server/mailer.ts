import nodemailer, { type Transporter } from 'nodemailer';
import { HttpError } from '@/lib/errors';

export type Mail = { to: string; subject: string; text: string; html: string };

const g = globalThis as unknown as { __mailer?: Transporter | null };

function transporter(): Transporter | null {
  if (g.__mailer !== undefined) return g.__mailer;
  const host = process.env.SMTP_HOST;
  if (!host) return (g.__mailer = null);
  const port = Number(process.env.SMTP_PORT || 587);
  g.__mailer = nodemailer.createTransport({
    host,
    port,
    secure: port === 465, // 465 = TLS from the start; 587 = STARTTLS (Hetzner blocks outgoing 465 and 25)
    requireTLS: port !== 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    // Fail in seconds, not minutes, when the mail server can't be reached (e.g. a blocked port).
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
  return g.__mailer;
}

/**
 * Mail servers (e.g. Hostinger) only allow sending from the mailbox you log in with, so the
 * address is always SMTP_USER. MAIL_FROM only supplies the display name ("inonlink <...>").
 */
function sender() {
  const user = process.env.SMTP_USER;
  const configured = process.env.MAIL_FROM ?? '';
  if (!user) return configured;
  const name = /^\s*"?([^"<]*?)"?\s*</.exec(configured)?.[1]?.trim();
  return { name: name || 'inonlink', address: user };
}

/**
 * Sends one email over SMTP (settings in .env). Without SMTP_HOST, development prints the
 * email to the server log instead; production refuses, so codes are never silently lost.
 */
export async function sendMail(mail: Mail) {
  const t = transporter();
  if (!t) {
    if (process.env.NODE_ENV === 'production') {
      throw new HttpError(503, 'EMAIL_NOT_SET_UP', 'Email is not set up yet. Please try again later.');
    }
    console.log(`[mail] to ${mail.to}: ${mail.subject}\n${mail.text}`);
    return;
  }
  try {
    await t.sendMail({ from: sender(), ...mail });
  } catch (e) {
    console.error('[mail] send failed', e);
    const code = (e as { code?: string }).code;
    if (code === 'ETIMEDOUT' || code === 'ECONNECTION' || code === 'ESOCKET' || code === 'EDNS') {
      throw new HttpError(503, 'EMAIL_UNREACHABLE', 'Email service is not reachable right now. Please try again later.');
    }
    throw new HttpError(502, 'EMAIL_FAILED', 'Could not send the email. Check the address and try again.');
  }
}
