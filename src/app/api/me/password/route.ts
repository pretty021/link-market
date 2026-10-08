import { body, requireActor, route } from '@/lib/http';
import { rateLimit } from '@/lib/rate-limit';
import { passwordChangeSchema } from '@/lib/validation';
import { changePassword } from '@/server/services/users';

export const POST = route(async (req) => {
  const actor = await requireActor(req);
  rateLimit(`password:${actor.id}`, 5, 60_000);
  const input = await body(req, passwordChangeSchema);
  await changePassword(actor, input.currentPassword, input.newPassword);
  return { ok: true };
});
