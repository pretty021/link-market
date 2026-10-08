import { body, requireAdmin, route } from '@/lib/http';
import { acceptSchema } from '@/lib/validation';
import { acceptPost } from '@/server/services/posts';

export const POST = route(async (req, { params }) => {
  const admin = await requireAdmin(req);
  const { note } = await body(req, acceptSchema);
  return acceptPost(admin, params.id, note);
});
