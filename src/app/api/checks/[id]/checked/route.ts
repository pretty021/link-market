import { requireClient, route } from '@/lib/http';
import { markChecked } from '@/server/services/checks';

export const POST = route(async (req, { params }) => markChecked(await requireClient(req), params.id));
