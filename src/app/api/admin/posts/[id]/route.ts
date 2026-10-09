import { body, requireAdmin, route } from '@/lib/http';
import { adminPostUpdateSchema } from '@/lib/validation';
import { deleteRequestedPost, updatePostByAdmin } from '@/server/services/posts';

export const PATCH = route(async (req, { params }) => {
  await requireAdmin(req);
  const input = await body(req, adminPostUpdateSchema);
  return updatePostByAdmin(params.id, input);
});

/** Only post requests (not yet accepted) can be deleted. */
export const DELETE = route(async (req, { params }) => {
  await requireAdmin(req);
  return deleteRequestedPost(params.id);
});
