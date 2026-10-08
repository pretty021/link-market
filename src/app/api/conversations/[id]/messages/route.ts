import { body, query, requireActor, route } from '@/lib/http';
import { rateLimit } from '@/lib/rate-limit';
import { cursorQuery, messageSchema } from '@/lib/validation';
import { listMessages, sendMessage } from '@/server/services/chat';

export const dynamic = 'force-dynamic';

export const GET = route(async (req, { params }) => {
  const actor = await requireActor(req);
  const { cursor } = query(req, cursorQuery);
  return listMessages(actor, params.id, cursor);
});

export const POST = route(async (req, { params }) => {
  const actor = await requireActor(req);
  rateLimit(`msg:${actor.id}`, 20, 10_000);
  const { body: text } = await body(req, messageSchema);
  return sendMessage(actor, params.id, text);
});
