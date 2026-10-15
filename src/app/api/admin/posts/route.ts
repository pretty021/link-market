import { body, query, requireAdmin, route } from '@/lib/http';
import { adminCreatePostSchema, postStatusQuery } from '@/lib/validation';
import { createPostByAdmin, listAdminPosts } from '@/server/services/posts';

export const dynamic = 'force-dynamic';

export const GET = route(async (req) => {
  await requireAdmin(req);
  const { status, kind } = query(req, postStatusQuery);
  return listAdminPosts(status, kind);
});

/** Admin adds an account for a seller: accepted and live straight away. */
export const POST = route(async (req) => {
  const admin = await requireAdmin(req);
  return createPostByAdmin(admin, await body(req, adminCreatePostSchema));
});
