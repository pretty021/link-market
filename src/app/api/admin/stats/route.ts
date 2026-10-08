import { requireAdmin, route } from '@/lib/http';
import { adminStats } from '@/server/services/users';

export const dynamic = 'force-dynamic';

export const GET = route(async (req) => {
  await requireAdmin(req);
  return { stats: await adminStats() };
});
