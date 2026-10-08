import { requireActor, route } from '@/lib/http';
import { listChecksForPost } from '@/server/services/checks';

export const dynamic = 'force-dynamic';

export const GET = route(async (req, { params }) => ({
  checks: await listChecksForPost(await requireActor(req), params.id),
}));
