import { requireCustomer, route } from '@/lib/http';
import { rateLimit } from '@/lib/rate-limit';
import { confirmPost } from '@/server/services/posts';

export const POST = route(async (req, { params }) => {
  const customer = await requireCustomer(req);
  rateLimit(`confirm:${customer.id}`, 5, 10_000);
  return confirmPost(customer, params.id);
});
