import { body, requestMeta, route } from '@/lib/http';
import { rateLimit } from '@/lib/rate-limit';
import { signupCodeSchema } from '@/lib/validation';
import { sendSignupCode } from '@/server/services/email-codes';

/** Step 1 of sign-up: email a 6-digit code to prove the address is real. */
export const POST = route(async (req) => {
  const { email } = await body(req, signupCodeSchema);
  rateLimit(`signup-code:${requestMeta(req).ip ?? 'unknown'}`, 10, 60 * 60_000);
  return sendSignupCode(email);
});
