import type { Notification, NotificationType, Prisma } from '@prisma/client';
import { prisma, type Tx } from '@/lib/db';
import type { Actor } from '@/lib/actor';
import { notFound } from '@/lib/errors';
import { rooms } from '@/lib/realtime';
import type { Outbox } from '../outbox';

export type NotificationDTO = ReturnType<typeof toNotificationDTO>;

export function toNotificationDTO(n: Notification) {
  return {
    id: n.id,
    type: n.type,
    title: n.title,
    body: n.body,
    postId: n.postId,
    conversationId: n.conversationId,
    readAt: n.readAt,
    createdAt: n.createdAt,
  };
}

type Recipient = { userId: string } | { adminId: string };

export async function notify(
  tx: Tx,
  out: Outbox,
  to: Recipient,
  data: { type: NotificationType; title: string; body?: string; postId?: string | null; conversationId?: string | null },
) {
  const n = await tx.notification.create({
    data: {
      type: data.type,
      title: data.title,
      body: data.body ?? null,
      postId: data.postId ?? null,
      conversationId: data.conversationId ?? null,
      userId: 'userId' in to ? to.userId : null,
      adminId: 'adminId' in to ? to.adminId : null,
    },
  });
  const room = 'userId' in to ? rooms.user(to.userId) : rooms.admin(to.adminId);
  out.push(room, 'notification:new', { notification: toNotificationDTO(n) });
  return n;
}

function ownerWhere(actor: Actor): Prisma.NotificationWhereInput {
  return actor.kind === 'admin' ? { adminId: actor.id } : { userId: actor.id };
}

export async function listNotifications(actor: Actor, cursor?: string, take = 20) {
  const rows = await prisma.notification.findMany({
    where: ownerWhere(actor),
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: take + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });
  const hasMore = rows.length > take;
  const items = rows.slice(0, take).map(toNotificationDTO);
  return { items, nextCursor: hasMore ? items[items.length - 1]?.id ?? null : null };
}

export async function unreadNotificationCount(actor: Actor) {
  return prisma.notification.count({ where: { ...ownerWhere(actor), readAt: null } });
}

export async function markNotificationRead(actor: Actor, id: string) {
  const res = await prisma.notification.updateMany({
    where: { id, ...ownerWhere(actor) },
    data: { readAt: new Date() },
  });
  if (res.count === 0) throw notFound('Notification');
  const n = await prisma.notification.findUniqueOrThrow({ where: { id } });
  return toNotificationDTO(n);
}

export async function markAllNotificationsRead(actor: Actor) {
  await prisma.notification.updateMany({ where: { ...ownerWhere(actor), readAt: null }, data: { readAt: new Date() } });
}
