import type { CheckSubmission, Message, MessageType, Prisma } from '@prisma/client';
import type { Tx } from '@/lib/db';
import { rooms } from '@/lib/realtime';
import type { ChatFile } from '@/lib/storage';
import type { Outbox } from '../outbox';

export const messageInclude = {
  senderUser: { select: { id: true, name: true, role: true, image: true } },
  senderAdmin: { select: { id: true, name: true, email: true } },
  checkSubmission: true,
} as const;

type MessageRow = Message & {
  senderUser: { id: string; name: string; role: string; image: unknown } | null;
  senderAdmin: { id: string; name: string | null; email: string } | null;
  checkSubmission: CheckSubmission | null;
};

export function toCheckDTO(c: CheckSubmission) {
  return {
    id: c.id,
    postId: c.postId,
    customerId: c.customerId,
    url: c.url,
    paymentType: c.paymentType,
    paymentAddress: c.paymentAddress,
    status: c.status,
    reviewedAt: c.reviewedAt,
    createdAt: c.createdAt,
  };
}
export type CheckDTO = ReturnType<typeof toCheckDTO>;

/** File metadata for the UI; the file itself is only served to conversation members via `url`. */
export function toAttachmentDTO(m: Pick<Message, 'id' | 'conversationId' | 'type' | 'attachment'>) {
  if (m.type !== 'FILE' || !m.attachment) return null;
  const a = m.attachment as unknown as ChatFile;
  return {
    name: a.name,
    mimeType: a.mimeType,
    size: a.size,
    width: a.width ?? null,
    height: a.height ?? null,
    isImage: a.mimeType.startsWith('image/'),
    url: `/api/conversations/${m.conversationId}/messages/${m.id}/file`,
  };
}

/** includeCheck=false strips CheckSubmission data for callers who may not see it. */
export function toMessageDTO(m: MessageRow, includeCheck: boolean) {
  return {
    id: m.id,
    conversationId: m.conversationId,
    type: m.type,
    body: m.body,
    attachment: toAttachmentDTO(m),
    createdAt: m.createdAt,
    sender: m.senderUser
      ? { kind: 'user' as const, id: m.senderUser.id, name: m.senderUser.name, role: m.senderUser.role }
      : m.senderAdmin
        ? { kind: 'admin' as const, id: m.senderAdmin.id, name: m.senderAdmin.name ?? 'Admin', role: 'ADMIN' }
        : null,
    checkSubmissionId: m.checkSubmissionId,
    check: includeCheck && m.checkSubmission ? toCheckDTO(m.checkSubmission) : null,
  };
}
export type MessageDTO = ReturnType<typeof toMessageDTO>;

export async function addMessage(
  tx: Tx,
  out: Outbox,
  data: {
    conversationId: string;
    type: MessageType;
    body: string | null;
    senderUserId?: string | null;
    senderAdminId?: string | null;
    checkSubmissionId?: string | null;
    attachment?: ChatFile | null;
  },
) {
  const m = await tx.message.create({
    data: {
      conversationId: data.conversationId,
      type: data.type,
      body: data.body,
      senderUserId: data.senderUserId ?? null,
      senderAdminId: data.senderAdminId ?? null,
      checkSubmissionId: data.checkSubmissionId ?? null,
      ...(data.attachment ? { attachment: data.attachment as unknown as Prisma.InputJsonValue } : {}),
    },
    include: messageInclude,
  });
  await tx.conversation.update({ where: { id: data.conversationId }, data: { lastMessageAt: m.createdAt } });

  // Check details only go to the conversation room (its participants) and admins;
  // DEAL participants are always the post's Client and the Customer who submitted.
  const dto = toMessageDTO(m, true);
  out.push([rooms.conversation(data.conversationId), rooms.admins], 'message:new', { message: dto });
  return m;
}

export async function conversationParticipantRooms(tx: Tx, conversationId: string) {
  const parts = await tx.conversationParticipant.findMany({ where: { conversationId } });
  return parts.map((p) => (p.userId ? rooms.user(p.userId) : rooms.admin(p.adminId!)));
}
