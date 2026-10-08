import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import path from 'node:path';
import { loadEnvConfig } from '@next/env';
import next from 'next';
import { Server, type Socket } from 'socket.io';
import { SESSION_COOKIE, parseCookie, resolveSession } from '@/lib/auth';
import type { Actor } from '@/lib/actor';
import { prisma } from '@/lib/db';
import { addViewer, emit, markOffline, markOnline, removeViewer, rooms, setIo } from '@/lib/realtime';
import { UPLOAD_DIR } from '@/lib/storage';
import { canJoinConversation } from './services/chat';
import { expireDue } from './services/posts';
import { adminStats } from './services/users';

const dev = process.env.NODE_ENV !== 'production';
loadEnvConfig(process.cwd(), dev);
const port = Number(process.env.PORT ?? 3000);
const EXPIRY_INTERVAL_MS = 5_000;

const MIME: Record<string, string> = { '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };

async function serveUpload(req: IncomingMessage, res: ServerResponse) {
  const rel = decodeURIComponent((req.url ?? '').split('?')[0].replace(/^\/uploads\//, ''));
  const file = path.resolve(UPLOAD_DIR, rel);
  const type = MIME[path.extname(file).toLowerCase()];
  // Only public images (post covers, avatars). Chat files under files/ are served to conversation members by the API.
  if (!file.startsWith(path.join(UPLOAD_DIR, 'images') + path.sep) || !type) {
    res.writeHead(404).end();
    return;
  }
  try {
    const s = await stat(file);
    res.writeHead(200, {
      'Content-Type': type,
      'Content-Length': s.size,
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    });
    createReadStream(file).pipe(res);
  } catch {
    res.writeHead(404).end();
  }
}

function principalRoom(a: Actor) {
  return a.kind === 'admin' ? rooms.admin(a.id) : rooms.user(a.id);
}

async function touchLastSeen(a: Actor) {
  const data = { lastSeenAt: new Date() };
  if (a.kind === 'admin') await prisma.admin.update({ where: { id: a.id }, data }).catch(() => undefined);
  else await prisma.user.update({ where: { id: a.id }, data }).catch(() => undefined);
}

async function broadcastPresence(a: Actor, online: boolean) {
  if (a.kind !== 'user') return;
  emit(rooms.admins, 'presence:update', { userId: a.id, role: a.role, online, stats: await adminStats() });
  if (a.role === 'CUSTOMER') emit(rooms.clients, 'presence:update', { userId: a.id, role: a.role, online });
}

function registerSocket(io: Server, socket: Socket) {
  const actor = socket.data.actor as Actor;
  const viewing = new Set<string>();

  socket.join(principalRoom(actor));
  // Lets the page detect that the browser's (shared) session cookie now belongs to another account.
  socket.emit('session:hello', { kind: actor.kind, id: actor.id });
  if (actor.kind === 'admin') socket.join(rooms.admins);
  else socket.join(actor.role === 'CUSTOMER' ? rooms.customers : rooms.clients);

  markOnline(actor.id);
  void touchLastSeen(actor).then(() => broadcastPresence(actor, true));

  socket.on('heartbeat', () => void touchLastSeen(actor));

  socket.on('post:join', (p: { postId?: string }) => {
    const postId = typeof p?.postId === 'string' ? p.postId : null;
    if (!postId || viewing.has(postId)) return;
    socket.join(rooms.post(postId));
    if (actor.kind === 'user' && actor.role === 'CUSTOMER') {
      viewing.add(postId);
      const count = addViewer(postId, actor.id);
      emit([rooms.post(postId), rooms.customers, rooms.admins], 'post:viewers', { postId, count });
    }
  });

  const leavePost = (postId: string) => {
    socket.leave(rooms.post(postId));
    if (!viewing.delete(postId)) return;
    const count = removeViewer(postId, actor.id);
    emit([rooms.post(postId), rooms.customers, rooms.admins], 'post:viewers', { postId, count });
  };
  socket.on('post:leave', (p: { postId?: string }) => {
    if (typeof p?.postId === 'string') leavePost(p.postId);
  });

  socket.on('conversation:join', async (p: { conversationId?: string }, ack?: (ok: boolean) => void) => {
    const id = typeof p?.conversationId === 'string' ? p.conversationId : null;
    const ok = !!id && (await canJoinConversation(actor, id));
    if (ok) socket.join(rooms.conversation(id!));
    if (typeof ack === 'function') ack(ok);
  });
  socket.on('conversation:leave', (p: { conversationId?: string }) => {
    if (typeof p?.conversationId === 'string') socket.leave(rooms.conversation(p.conversationId));
  });

  socket.on('disconnect', () => {
    for (const postId of [...viewing]) leavePost(postId);
    if (markOffline(actor.id)) void touchLastSeen(actor).then(() => broadcastPresence(actor, false));
  });
}

async function main() {
  const app = next({ dev, port });
  const handle = app.getRequestHandler();
  await app.prepare();

  const server = createServer((req, res) => {
    if (req.url?.startsWith('/uploads/')) {
      void serveUpload(req, res);
      return;
    }
    void handle(req, res);
  });

  const io = new Server(server, { path: '/socket.io', serveClient: false });
  setIo(io);

  io.use(async (socket, nextFn) => {
    const token = parseCookie(socket.handshake.headers.cookie, SESSION_COOKIE);
    const actor = await resolveSession(token).catch(() => null);
    if (!actor) return nextFn(new Error('UNAUTHORIZED'));
    socket.data.actor = actor;
    nextFn();
  });
  io.on('connection', (socket) => registerSocket(io, socket));

  // Background expiry: a PROGRESSING post never outlives its deadline by more than ~5s,
  // even if nobody opens a page (pages also run the same expiry on read).
  let running = false;
  setInterval(async () => {
    if (running) return;
    running = true;
    try {
      await expireDue();
    } catch (err) {
      console.error('[expiry] failed', err);
    } finally {
      running = false;
    }
  }, EXPIRY_INTERVAL_MS);

  server.listen(port, () => console.log(`> LinkMarket ready on http://localhost:${port} (${dev ? 'dev' : 'prod'})`));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
