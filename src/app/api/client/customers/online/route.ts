import { requireClient, route } from '@/lib/http';
import { onlineCustomers } from '@/server/services/users';

export const dynamic = 'force-dynamic';

export const GET = route(async (req) => {
  await requireClient(req);
  return { customers: await onlineCustomers() };
});
