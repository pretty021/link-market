import { requireActor, route } from '@/lib/http';
import { getChatFile } from '@/server/services/chat';

export const dynamic = 'force-dynamic';

/**
 * A chat file, only for members of the conversation (and Admins). Images may display inline;
 * every other type always downloads, and the sandbox CSP stops a file from running as a page.
 */
export const GET = route(async (req, { params }) => {
  const actor = await requireActor(req);
  const f = await getChatFile(actor, params.id, params.messageId);
  const inline = f.mimeType.startsWith('image/') && new URL(req.url).searchParams.get('download') !== '1';
  return new Response(new Uint8Array(f.buf), {
    headers: {
      'Content-Type': f.mimeType,
      'Content-Length': String(f.buf.length),
      'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${f.name.replace(/[^\x20-\x7e]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(f.name)}`,
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
      'Cache-Control': 'private, max-age=3600',
    },
  });
});
