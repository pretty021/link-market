import { requireActor, route } from '@/lib/http';
import { ensureSupportConversation } from '@/server/services/chat';

export const POST = route(async (req) => ensureSupportConversation(await requireActor(req)));
