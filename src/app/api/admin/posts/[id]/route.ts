import { body, requireAdmin, route } from '@/lib/http';
import { adminPostUpdateSchema } from '@/lib/validation';
import { deletePostByAdmin, updatePostByAdmin } from '@/server/services/posts';

export const PATCH = route(async (req, { params }) => {
  await requireAdmin(req);
  const input = await body(req, adminPostUpdateSchema);
  return updatePostByAdmin(params.id, input);
});

/** Requests, published and completed accounts can be deleted (not one a buyer is holding). */
export const DELETE = route(async (req, { params }) => {
  await requireAdmin(req);
  return deletePostByAdmin(params.id);
});
