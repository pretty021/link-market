import { requireClient, route } from '@/lib/http';
import { markNotChecked } from '@/server/services/checks';

export const POST = route(async (req, { params }) => markNotChecked(await requireClient(req), params.id));
