import nodemailer, { type Transporter } from 'nodemailer';
import { HttpError } from '@/lib/errors';

export type Mail = { to: string; subject: string; text: string; html: string };

const g = globalThis as unknown as { __mailer?: Transporter | null };

function transporter(): Transporter | null {
  if (g.__mailer !== undefined) return g.__mailer;
  const host = process.env.SMTP_HOST;
  if (!host) return (g.__mailer = null);
  const port = Number(process.env.SMTP_PORT || 465);
  g.__mailer = nodemailer.createTransport({
    host,
    port,
    secure: port === 465, // 465 = TLS from the start; 587 = STARTTLS
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
  return g.__mailer;
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
    await t.sendMail({ from: process.env.MAIL_FROM || process.env.SMTP_USER, ...mail });
  } catch (e) {
    console.error('[mail] send failed', e);
    throw new HttpError(502, 'EMAIL_FAILED', 'Could not send the email. Check the address and try again.');
  }
}
