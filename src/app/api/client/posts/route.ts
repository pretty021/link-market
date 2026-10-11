import { body, requireClient, route } from '@/lib/http';
import { clientPostsSchema } from '@/lib/validation';
import { createClientPosts, listClientPosts } from '@/server/services/posts';

export const dynamic = 'force-dynamic';

export const GET = route(async (req) => listClientPosts(await requireClient(req)));

export const POST = route(async (req) => {
  const client = await requireClient(req);
  const { posts } = await body(req, clientPostsSchema);
  return createClientPosts(client, posts);
});
