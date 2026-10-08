import { body, requireCustomer, route } from '@/lib/http';
import { rateLimit } from '@/lib/rate-limit';
import { checkUrlSchema } from '@/lib/validation';
import { submitCheck } from '@/server/services/checks';

export const POST = route(async (req, { params }) => {
  const customer = await requireCustomer(req);
  rateLimit(`check:${customer.id}`, 10, 60_000);
  const { url } = await body(req, checkUrlSchema);
  return submitCheck(customer, params.id, url);
});
