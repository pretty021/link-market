import { query, requireAdmin, route } from '@/lib/http';
import { postStatusQuery } from '@/lib/validation';
import { listAdminPosts } from '@/server/services/posts';

export const dynamic = 'force-dynamic';

export const GET = route(async (req) => {
  await requireAdmin(req);
  const { status } = query(req, postStatusQuery);
  return listAdminPosts(status);
});
