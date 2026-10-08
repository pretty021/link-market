import { body, requireAdmin, route } from '@/lib/http';
import { adminPostUpdateSchema } from '@/lib/validation';
import { updatePostByAdmin } from '@/server/services/posts';

export const PATCH = route(async (req, { params }) => {
  await requireAdmin(req);
  const input = await body(req, adminPostUpdateSchema);
  return updatePostByAdmin(params.id, input);
});
