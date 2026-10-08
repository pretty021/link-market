import { requireAdmin, route } from '@/lib/http';
import { setBlocked } from '@/server/services/users';

export const POST = route(async (req, { params }) => {
  await requireAdmin(req);
  return { user: await setBlocked(params.id, true) };
});
