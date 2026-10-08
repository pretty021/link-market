import { requireActor, route } from '@/lib/http';
import { markAllNotificationsRead } from '@/server/services/notifications';

export const POST = route(async (req) => {
  await markAllNotificationsRead(await requireActor(req));
  return { ok: true };
});
