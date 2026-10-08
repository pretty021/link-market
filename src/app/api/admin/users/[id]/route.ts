import { body, requireAdmin, route } from '@/lib/http';
import { adminUpdateUserSchema } from '@/lib/validation';
import { softDeleteUser, updateUser } from '@/server/services/users';

export const PATCH = route(async (req, { params }) => {
  await requireAdmin(req);
  const input = await body(req, adminUpdateUserSchema);
  return { user: await updateUser(params.id, input) };
});

export const DELETE = route(async (req, { params }) => {
  await requireAdmin(req);
  await softDeleteUser(params.id);
  return { ok: true };
});
