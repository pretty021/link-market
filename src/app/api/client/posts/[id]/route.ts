import { body, requireClient, route } from '@/lib/http';
import { adminPostUpdateSchema } from '@/lib/validation';
import { deletePostByClient, updatePostByClient } from '@/server/services/posts';

export const dynamic = 'force-dynamic';

/** The signed-in seller edits one of their own accounts. */
export const PATCH = route(async (req, { params }) => {
  const client = await requireClient(req);
  const input = await body(req, adminPostUpdateSchema);
  return updatePostByClient(client, params.id, input);
});

/** The signed-in seller deletes one of their own accounts. */
export const DELETE = route(async (req, { params }) => {
  const client = await requireClient(req);
  return deletePostByClient(client, params.id);
});
