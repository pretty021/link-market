import { Prisma, type ConversationType } from '@prisma/client';
import { prisma } from '@/lib/db';
import type { Actor, AdminActor } from '@/lib/actor';
import { badRequest, conflict, forbidden, notFound } from '@/lib/errors';
import { isViewingConversation, rooms } from '@/lib/realtime';
import { readChatFile, storeChatFile, type ChatFile } from '@/lib/storage';
import { Outbox } from '../outbox';
import { notify } from './notifications';
import { addMessage, messageInclude, toMessageDTO } from './messages';
import { canSeeChecks } from './checks';
import { dbNow, postInclude, toPostDTO } from './posts';

const convInclude = {
  post: { include: postInclude },
  participants: {
    include: {
      user: { select: { id: true, name: true, email: true, role: true, image: true } },
      admin: { select: { id: true, name: true, email: true } },
    },
  },
  messages: { orderBy: { createdAt: 'desc' as const }, take: 1, select: { body: true, type: true, createdAt: true, attachment: true } },
} satisfies Prisma.ConversationInclude;

type ConvRow = Prisma.ConversationGetPayload<{ include: typeof convInclude }>;

function toConversationDTO(c: ConvRow, actor: Actor, unread: number) {
  const participants = c.participants.map((p) =>
    p.user
      ? { kind: 'user' as const, id: p.user.id, name: p.user.name, email: p.user.email, role: p.user.role, image: p.user.image }
      : { kind: 'admin' as const, id: p.admin!.id, name: p.admin!.name ?? 'Admin', email: p.admin!.email, role: 'ADMIN', image: null },
  );
  const others = participants.filter((p) => p.id !== actor.id);
  const last = c.messages[0];
  const staff = actor.kind === 'admin' || (c.post !== null && actor.id === c.post.clientId);
  return {
    id: c.id,
    type: c.type,
    postId: c.postId,
    post: c.post ? toPostDTO(c.post, { staff }) : null,
    participants,
    title: others.map((o) => o.name).join(', ') || participants.map((p) => p.name).join(', '),
    lastMessageAt: c.lastMessageAt,
    lastMessage: last ? { body: last.type === 'CHECK_REQUEST' ? 'Checking info submitted' : last.type === 'FILE' ? `📎 ${(last.attachment as { name?: string } | null)?.name ?? 'File'}` : last.body, type: last.type } : null,
    unread,
    isParticipant: participants.some((p) => p.id === actor.id),
  };
}
export type ConversationDTO = ReturnType<typeof toConversationDTO>;

async function unreadCounts(actor: Actor, conversationIds: string[]) {
  if (conversationIds.length === 0) return new Map<string, number>();
  const ownerCol = actor.kind === 'admin' ? Prisma.sql`cp."adminId"` : Prisma.sql`cp."userId"`;
  const senderCol = actor.kind === 'admin' ? Prisma.sql`m."senderAdminId"` : Prisma.sql`m."senderUserId"`;
  const rows = await prisma.$queryRaw<{ conversationId: string; n: bigint }[]>`
    SELECT cp."conversationId", COUNT(m.id) AS n
    FROM "ConversationParticipant" cp
    JOIN "Message" m ON m."conversationId" = cp."conversationId"
      AND (cp."lastReadAt" IS NULL OR m."createdAt" > cp."lastReadAt")
      AND (${senderCol} IS NULL OR ${senderCol} <> ${actor.id})
    WHERE ${ownerCol} = ${actor.id} AND cp."conversationId" = ANY(${conversationIds})
    GROUP BY cp."conversationId"`;
  return new Map(rows.map((r) => [r.conversationId, Number(r.n)]));
}

const lastMessageOrder: Prisma.ConversationOrderByWithRelationInput[] = [
  { lastMessageAt: { sort: 'desc', nulls: 'last' } },
  { createdAt: 'desc' },
];

/** Conversations the actor participates in (Admin: their own ADMIN_* chats). */
export async function listMyConversations(actor: Actor, q?: string) {
  const and: Prisma.ConversationWhereInput[] = [
    { participants: { some: actor.kind === 'admin' ? { adminId: actor.id } : { userId: actor.id } } },
  ];
  if (q) {
    and.push({
      participants: {
        some: { user: { OR: [{ name: { contains: q, mode: 'insensitive' } }, { email: { contains: q, mode: 'insensitive' } }] } },
      },
    });
  }
  const where: Prisma.ConversationWhereInput = { AND: and };
  const convs = await prisma.conversation.findMany({ where, include: convInclude, orderBy: lastMessageOrder });
  const unread = await unreadCounts(actor, convs.map((c) => c.id));
  return { conversations: convs.map((c) => toConversationDTO(c, actor, unread.get(c.id) ?? 0)), serverNow: await dbNow() };
}

/** Admin: every conversation in the system, with filters. */
export async function listAllConversations(
  admin: AdminActor,
  f: { type?: ConversationType; userId?: string; postId?: string; q?: string },
) {
  const and: Prisma.ConversationWhereInput[] = [];
  if (f.type) and.push({ type: f.type });
  if (f.postId) and.push({ postId: f.postId });
  if (f.userId) and.push({ participants: { some: { userId: f.userId } } });
  if (f.q) {
    and.push({
      participants: {
        some: {
          user: { OR: [{ name: { contains: f.q, mode: 'insensitive' } }, { email: { contains: f.q, mode: 'insensitive' } }] },
        },
      },
    });
  }
  const convs = await prisma.conversation.findMany({
    where: { AND: and },
    include: convInclude,
    orderBy: lastMessageOrder,
    take: 200,
  });
  const unread = await unreadCounts(admin, convs.map((c) => c.id));
  return { conversations: convs.map((c) => toConversationDTO(c, admin, unread.get(c.id) ?? 0)), serverNow: await dbNow() };
}

async function loadAccessible(actor: Actor, conversationId: string) {
  const conv = await prisma.conversation.findUnique({ where: { id: conversationId }, include: convInclude });
  if (!conv) throw notFound('Conversation');
  if (actor.kind === 'admin') return conv;
  if (!conv.participants.some((p) => p.userId === actor.id)) throw forbidden();
  return conv;
}

export async function canJoinConversation(actor: Actor, conversationId: string) {
  try {
    await loadAccessible(actor, conversationId);
    return true;
  } catch {
    return false;
  }
}

export async function getConversation(actor: Actor, conversationId: string) {
  const conv = await loadAccessible(actor, conversationId);
  const unread = await unreadCounts(actor, [conv.id]);
  return { conversation: toConversationDTO(conv, actor, unread.get(conv.id) ?? 0), serverNow: await dbNow() };
}

export async function listMessages(actor: Actor, conversationId: string, cursor?: string, take = 50) {
  const conv = await loadAccessible(actor, conversationId);
  const rows = await prisma.message.findMany({
    where: { conversationId },
    include: messageInclude,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: take + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });
  const hasMore = rows.length > take;
  const page = rows.slice(0, take).reverse();
  const showChecks = conv.post ? canSeeChecks(actor, conv.post) : false;

  // State the deal chat UI needs: may this user send text, and the latest submission (if visible).
  let deal: null | {
    latestCheck: ReturnType<typeof toMessageDTO>['check'];
    canSendText: boolean;
    isHolder: boolean;
    isClient: boolean;
  } = null;
  if (conv.type === 'DEAL' && conv.post) {
    const customer = conv.participants.find((p) => p.user?.role === 'CUSTOMER');
    const latest = customer
      ? await prisma.checkSubmission.findFirst({
          where: { postId: conv.post.id, customerId: customer.userId! },
          orderBy: { createdAt: 'desc' },
        })
      : null;
    const isClient = actor.kind === 'user' && actor.id === conv.post.clientId;
    const isHolder = actor.kind === 'user' && actor.id === conv.post.holderId;
    deal = {
      latestCheck:
        showChecks && latest
          ? { id: latest.id, postId: latest.postId, customerId: latest.customerId, url: latest.url, status: latest.status, reviewedAt: latest.reviewedAt, createdAt: latest.createdAt }
          : null,
      canSendText: actor.kind === 'user' && (isClient || latest?.status === 'CHECKED'),
      isHolder,
      isClient,
    };
  }

  return {
    messages: page.map((m) => toMessageDTO(m, showChecks)),
    nextCursor: hasMore ? page[0]?.id ?? null : null,
    readOnly: actor.kind === 'admin' ? conv.type === 'DEAL' : false,
    deal,
    serverNow: await dbNow(),
  };
}

export async function sendMessage(actor: Actor, conversationId: string, body: string) {
  return postMessage(actor, conversationId, { body, attachment: null });
}

/** Sends a file (with an optional caption). Same permissions as text: deal-chat Customers only after Checked. */
export async function sendFile(actor: Actor, conversationId: string, file: { buf: Buffer; name: string }, caption: string | null) {
  // Permission first, so a refused sender never stores a file.
  await assertCanSend(actor, await loadAccessible(actor, conversationId));
  const attachment = await storeChatFile(file.buf, file.name);
  return postMessage(actor, conversationId, { body: caption, attachment });
}

/** The stored file of a FILE message, for a member of its conversation (or an Admin). */
export async function getChatFile(actor: Actor, conversationId: string, messageId: string) {
  await loadAccessible(actor, conversationId);
  const m = await prisma.message.findUnique({ where: { id: messageId } });
  if (!m || m.conversationId !== conversationId || m.type !== 'FILE' || !m.attachment) throw notFound('File');
  const a = m.attachment as unknown as ChatFile;
  return { ...a, buf: await readChatFile(a.key) };
}

async function assertCanSend(actor: Actor, conv: Awaited<ReturnType<typeof loadAccessible>>) {
  if (actor.kind === 'admin') {
    if (conv.type === 'DEAL') throw forbidden('Deal chats are read-only for admins.');
    if (!conv.participants.some((p) => p.adminId === actor.id)) throw forbidden('Open your own chat with this user to reply.');
  } else if (conv.type === 'DEAL' && conv.post && actor.id !== conv.post.clientId) {
    const latest = await prisma.checkSubmission.findFirst({
      where: { postId: conv.post.id, customerId: actor.id },
      orderBy: { createdAt: 'desc' },
    });
    if (latest?.status !== 'CHECKED') {
      throw conflict('CHECK_REQUIRED', 'You can chat after the client marks your checking info as Checked.');
    }
  }
}

async function postMessage(actor: Actor, conversationId: string, content: { body: string | null; attachment: ChatFile | null }) {
  const { body, attachment } = content;
  const conv = await loadAccessible(actor, conversationId);
  await assertCanSend(actor, conv);

  // Who is not looking at this chat right now -> gets a NEW_MESSAGE notification.
  const recipients = conv.participants.filter((p) => (actor.kind === 'admin' ? p.adminId !== actor.id : p.userId !== actor.id));
  const notViewing: typeof recipients = [];
  for (const p of recipients) {
    const room = p.userId ? rooms.user(p.userId) : rooms.admin(p.adminId!);
    if (!(await isViewingConversation(room, conversationId))) notViewing.push(p);
  }

  const out = new Outbox();
  const message = await prisma.$transaction(async (tx) => {
    const m = await addMessage(tx, out, {
      conversationId,
      type: attachment ? 'FILE' : 'TEXT',
      body,
      attachment,
      senderUserId: actor.kind === 'user' ? actor.id : null,
      senderAdminId: actor.kind === 'admin' ? actor.id : null,
    });
    await tx.conversationParticipant.updateMany({
      where: { conversationId, ...(actor.kind === 'admin' ? { adminId: actor.id } : { userId: actor.id }) },
      data: { lastReadAt: m.createdAt },
    });
    for (const p of notViewing) {
      const owner = p.userId ? { userId: p.userId } : { adminId: p.adminId! };
      // One unread NEW_MESSAGE per conversation is enough; don't stack them.
      const existing = await tx.notification.findFirst({
        where: { ...owner, conversationId, type: 'NEW_MESSAGE', readAt: null },
      });
      if (!existing) {
        await notify(tx, out, owner, {
          type: 'NEW_MESSAGE',
          title: `New message from ${actor.name ?? 'Admin'}`,
          body: attachment ? `Sent a file: ${attachment.name}` : (body ?? '').slice(0, 140),
          postId: conv.postId,
          conversationId,
        });
      }
    }
    out.push(
      conv.participants.map((p) => (p.userId ? rooms.user(p.userId) : rooms.admin(p.adminId!))),
      'conversation:updated',
      { conversationId },
    );
    return m;
  });
  out.flush();
  return { message: toMessageDTO(message, conv.post ? canSeeChecks(actor, conv.post) : false) };
}

export async function markConversationRead(actor: Actor, conversationId: string) {
  await loadAccessible(actor, conversationId);
  if (actor.kind === 'admin') {
    // Admins reading someone else's chat must not change anyone's unread counts.
    await prisma.conversationParticipant.updateMany({ where: { conversationId, adminId: actor.id }, data: { lastReadAt: new Date() } });
    await prisma.notification.updateMany({ where: { adminId: actor.id, conversationId, readAt: null, type: 'NEW_MESSAGE' }, data: { readAt: new Date() } });
  } else {
    await prisma.conversationParticipant.updateMany({ where: { conversationId, userId: actor.id }, data: { lastReadAt: new Date() } });
    await prisma.notification.updateMany({ where: { userId: actor.id, conversationId, readAt: null, type: 'NEW_MESSAGE' }, data: { readAt: new Date() } });
  }
}

/** Admin starts (or reopens) a support chat with a Client or Customer. */
export async function startAdminConversation(admin: AdminActor, userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.deletedAt) throw notFound('User');
  const type: ConversationType = user.role === 'CLIENT' ? 'ADMIN_CLIENT' : 'ADMIN_CUSTOMER';
  const pairKey = `${admin.id}:${user.id}`;
  const conv = await prisma.conversation.upsert({ where: { pairKey }, create: { type, pairKey }, update: {} });
  if (conv.type !== type) throw badRequest('TYPE_MISMATCH');
  await prisma.conversationParticipant.createMany({
    data: [
      { conversationId: conv.id, adminId: admin.id },
      { conversationId: conv.id, userId: user.id },
    ],
    skipDuplicates: true,
  });
  return { conversationId: conv.id };
}

/** Client/Customer: their support thread with an Admin (created on first open). */
export async function ensureSupportConversation(actor: Actor) {
  if (actor.kind !== 'user') throw forbidden();
  const existing = await prisma.conversation.findFirst({
    where: { type: { in: ['ADMIN_CLIENT', 'ADMIN_CUSTOMER'] }, participants: { some: { userId: actor.id } } },
    orderBy: { createdAt: 'asc' },
  });
  if (existing) return { conversationId: existing.id };
  const admin = await prisma.admin.findFirst({ orderBy: { createdAt: 'asc' } });
  if (!admin) throw notFound('Admin');
  return startAdminConversation({ kind: 'admin', id: admin.id, name: admin.name, email: admin.email }, actor.id);
}
