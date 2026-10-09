import { badRequest } from '@/lib/errors';
import { getActor, route } from '@/lib/http';
import { rateLimit } from '@/lib/rate-limit';
import { MAX_IMAGE_BYTES, storeImage } from '@/lib/storage';

// Anonymous uploads are allowed only for the registration avatar, and are rate-limited by IP.
export const POST = route(async (req) => {
  const actor = await getActor(req);
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  rateLimit(`upload:${actor?.id ?? ip}`, actor ? 30 : 5, 60_000);

  const len = Number(req.headers.get('content-length') ?? 0);
  if (len > MAX_IMAGE_BYTES + 64 * 1024) throw badRequest('FILE_TOO_LARGE', 'Images must be 5 MB or smaller.');

  const form = await req.formData();
  const file = form.get('file');
  if (!(file instanceof File)) throw badRequest('NO_FILE', 'Choose an image to upload.');
  if (file.size > MAX_IMAGE_BYTES) throw badRequest('FILE_TOO_LARGE', 'Images must be 5 MB or smaller.');
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    throw badRequest('UNSUPPORTED_TYPE', 'Only JPG, PNG and WEBP images are allowed.');
  }
  const image = await storeImage(Buffer.from(await file.arrayBuffer()));
  return { image };
});
