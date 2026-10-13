import { body, query, requireClient, route } from '@/lib/http';
import { accountKindQuery, clientPostsSchema } from '@/lib/validation';
import { createClientPosts, listClientPosts } from '@/server/services/posts';

export const dynamic = 'force-dynamic';

export const GET = route(async (req) => {
  const client = await requireClient(req);
  const { kind } = query(req, accountKindQuery);
  return listClientPosts(client, kind);
});

export const POST = route(async (req) => {
  const client = await requireClient(req);
  const { posts } = await body(req, clientPostsSchema);
  return createClientPosts(client, posts);
});
