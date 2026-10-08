import { query, requireAdmin, route } from '@/lib/http';
import { cursorQuery } from '@/lib/validation';
import { listMessages } from '@/server/services/chat';

export const dynamic = 'force-dynamic';

export const GET = route(async (req, { params }) => {
  const admin = await requireAdmin(req);
  const { cursor } = query(req, cursorQuery);
  return listMessages(admin, params.id, cursor);
});
