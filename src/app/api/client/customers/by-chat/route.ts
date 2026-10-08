import { requireClient, route } from '@/lib/http';
import { customersByChat } from '@/server/services/users';

export const dynamic = 'force-dynamic';

export const GET = route(async (req) => {
  const client = await requireClient(req);
  return { chats: await customersByChat(client.id) };
});
