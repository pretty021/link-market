import { body, query, requireAdmin, route } from '@/lib/http';
import { adminCreateUserSchema, adminUsersQuery } from '@/lib/validation';
import { createUser, listUsers } from '@/server/services/users';

export const dynamic = 'force-dynamic';

export const GET = route(async (req) => {
  await requireAdmin(req);
  const { role, q } = query(req, adminUsersQuery);
  return { users: await listUsers(role, q) };
});

export const POST = route(async (req) => {
  const admin = await requireAdmin(req);
  const input = await body(req, adminCreateUserSchema);
  return { user: await createUser(admin, input) };
});
