import { body, requireAdmin, route } from '@/lib/http';
import { visibilitySchema } from '@/lib/validation';
import { setPostVisibility } from '@/server/services/posts';

/** Show or hide an accepted post for Customers. */
export const POST = route(async (req, { params }) => {
  await requireAdmin(req);
  const { visible } = await body(req, visibilitySchema);
  return setPostVisibility(params.id, visible);
});
