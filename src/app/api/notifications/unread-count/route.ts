import { requireActor, route } from '@/lib/http';
import { unreadNotificationCount } from '@/server/services/notifications';

export const dynamic = 'force-dynamic';

export const GET = route(async (req) => ({ count: await unreadNotificationCount(await requireActor(req)) }));
