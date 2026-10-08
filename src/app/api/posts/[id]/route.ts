import { requireCustomer, route } from '@/lib/http';
import { getPostForCustomer } from '@/server/services/posts';

export const dynamic = 'force-dynamic';

export const GET = route(async (req, { params }) => getPostForCustomer(await requireCustomer(req), params.id));
