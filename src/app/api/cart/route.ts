import { requireCustomer, route } from '@/lib/http';
import { getCart } from '@/server/services/posts';

export const dynamic = 'force-dynamic';

export const GET = route(async (req) => getCart(await requireCustomer(req)));
