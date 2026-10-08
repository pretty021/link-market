import { requireActor, route } from '@/lib/http';
import { getConversation } from '@/server/services/chat';

export const dynamic = 'force-dynamic';

export const GET = route(async (req, { params }) => getConversation(await requireActor(req), params.id));
