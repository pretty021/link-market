import { body, requireActor, route } from '@/lib/http';
import { profileSchema } from '@/lib/validation';
import { getMe, updateProfile } from '@/server/services/users';

export const dynamic = 'force-dynamic';

export const GET = route(async (req) => ({ me: await getMe(await requireActor(req)) }));

export const PATCH = route(async (req) => {
  const actor = await requireActor(req);
  const input = await body(req, profileSchema);
  return { me: await updateProfile(actor, input) };
});
