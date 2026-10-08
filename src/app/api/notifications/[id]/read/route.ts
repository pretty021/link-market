import { requireActor, route } from '@/lib/http';
import { markNotificationRead } from '@/server/services/notifications';

export const POST = route(async (req, { params }) => ({
  notification: await markNotificationRead(await requireActor(req), params.id),
}));
