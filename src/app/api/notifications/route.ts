import { query, requireActor, route } from '@/lib/http';
import { cursorQuery } from '@/lib/validation';
import { listNotifications } from '@/server/services/notifications';

export const dynamic = 'force-dynamic';

export const GET = route(async (req) => {
  const actor = await requireActor(req);
  const { cursor } = query(req, cursorQuery);
  return listNotifications(actor, cursor);
});
