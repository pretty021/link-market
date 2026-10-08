import { query, requireAdmin, route } from '@/lib/http';
import { adminConversationsQuery } from '@/lib/validation';
import { listAllConversations, listMyConversations } from '@/server/services/chat';

export const dynamic = 'force-dynamic';

export const GET = route(async (req) => {
  const admin = await requireAdmin(req);
  const f = query(req, adminConversationsQuery);
  if (f.scope === 'mine') return listMyConversations(admin, f.q);
  return listAllConversations(admin, f);
});
