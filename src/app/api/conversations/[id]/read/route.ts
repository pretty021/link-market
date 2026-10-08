import { requireActor, route } from '@/lib/http';
import { markConversationRead } from '@/server/services/chat';

export const POST = route(async (req, { params }) => {
  await markConversationRead(await requireActor(req), params.id);
  return { ok: true };
});
