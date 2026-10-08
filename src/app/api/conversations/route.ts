import { body, requireActor, requireAdmin, route } from '@/lib/http';
import { startConversationSchema } from '@/lib/validation';
import { listMyConversations, startAdminConversation } from '@/server/services/chat';

export const dynamic = 'force-dynamic';

export const GET = route(async (req) => {
  const actor = await requireActor(req);
  return listMyConversations(actor, req.nextUrl.searchParams.get('q')?.slice(0, 100) || undefined);
});

export const POST = route(async (req) => {
  const admin = await requireAdmin(req);
  const { userId } = await body(req, startConversationSchema);
  return startAdminConversation(admin, userId);
});
