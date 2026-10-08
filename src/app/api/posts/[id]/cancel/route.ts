import { requireCustomer, route } from '@/lib/http';
import { rateLimit } from '@/lib/rate-limit';
import { cancelHold } from '@/server/services/posts';

export const POST = route(async (req, { params }) => {
  const customer = await requireCustomer(req);
  rateLimit(`cancel:${customer.id}`, 5, 10_000);
  return cancelHold(customer, params.id);
});
