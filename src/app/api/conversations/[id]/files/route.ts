import { badRequest } from '@/lib/errors';
import { requireActor, route } from '@/lib/http';
import { rateLimit } from '@/lib/rate-limit';
import { MAX_CHAT_FILE_BYTES } from '@/lib/storage';
import { sendFile } from '@/server/services/chat';

/** Sends a file into a conversation (multipart: `file`, optional `caption`). */
export const POST = route(async (req, { params }) => {
  const actor = await requireActor(req);
  rateLimit(`msg:${actor.id}`, 20, 10_000);
  rateLimit(`chatfile:${actor.id}`, 10, 60_000);

  const len = Number(req.headers.get('content-length') ?? 0);
  if (len > MAX_CHAT_FILE_BYTES + 64 * 1024) throw badRequest('FILE_TOO_LARGE', 'Files must be 10 MB or smaller.');

  const form = await req.formData();
  const file = form.get('file');
  if (!(file instanceof File)) throw badRequest('NO_FILE', 'Choose a file to send.');
  if (file.size > MAX_CHAT_FILE_BYTES) throw badRequest('FILE_TOO_LARGE', 'Files must be 10 MB or smaller.');
  const captionRaw = form.get('caption');
  const caption = typeof captionRaw === 'string' && captionRaw.trim() ? captionRaw.trim().slice(0, 4000) : null;

  return sendFile(actor, params.id, { buf: Buffer.from(await file.arrayBuffer()), name: file.name }, caption);
});
