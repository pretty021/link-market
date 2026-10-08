import { requireCustomer, route } from '@/lib/http';
import { listFeed } from '@/server/services/posts';

export const dynamic = 'force-dynamic';

export const GET = route(async (req) => listFeed(await requireCustomer(req)));
