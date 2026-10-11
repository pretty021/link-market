import { DB_NOW, prisma } from '@/lib/db';
import type { Actor, UserActor } from '@/lib/actor';
import { conflict, forbidden, notFound } from '@/lib/errors';
import { emit, rooms } from '@/lib/realtime';
import { Outbox } from '../outbox';
import { notify } from './notifications';
import { addMessage, toCheckDTO } from './messages';
import { cartSnapshot, dbNow, postInclude, pushPost } from './posts';

/** CheckSubmission data is visible only to the post's holder, the post's Client and Admins. */
export function canSeeChecks(actor: Actor, post: { holderId: string | null; clientId: string }) {
  if (actor.kind === 'admin') return true;
  return actor.id === post.clientId || (post.holderId !== null && actor.id === post.holderId);
}

export async function getCheck(actor: Actor, checkId: string) {
  const check = await prisma.checkSubmission.findUnique({ where: { id: checkId }, include: { post: true } });
  if (!check) throw notFound('Check');
  if (!canSeeChecks(actor, check.post)) throw forbidden();
  return toCheckDTO(check);
}

export async function listChecksForPost(actor: Actor, postId: string) {
  const post = await prisma.post.findUnique({ where: { id: postId } });
  if (!post) throw notFound('Link');
  if (!canSeeChecks(actor, post)) throw forbidden();
  const checks = await prisma.checkSubmission.findMany({ where: { postId }, orderBy: { createdAt: 'desc' } });
  return checks.map(toCheckDTO);
}

function checkRooms(clientId: string, customerId: string) {
  return [rooms.user(clientId), rooms.user(customerId), rooms.admins];
}

/** Customer submits checking info while holding the post (first submit or resubmit after Not checked). */
export async function submitCheck(customer: UserActor, postId: string, url: string) {
  const out = new Outbox();
  const result = await prisma.$transaction(async (tx) => {
    // Lock the post row: a concurrent expiry waits for us (or we see its result), and two
    // submits for the same post are serialized.
    const locked = await tx.$queryRaw<{ id: string; clientId: string; title: string; name: string | null }[]>`
      SELECT id, "clientId", title, name FROM "Post"
      WHERE id = ${postId} AND status = 'PROGRESSING' AND "holderId" = ${customer.id}
        AND "progressingExpiresAt" > ${DB_NOW}
      FOR UPDATE`;
    if (locked.length === 0) {
      throw conflict('NOT_HOLDER', 'You are not progressing this link, or the time has expired.');
    }
    const post = locked[0];

    const pending = await tx.checkSubmission.findFirst({ where: { postId, status: 'PENDING' } });
    if (pending) throw conflict('CHECK_PENDING', 'Your checking info is already waiting for the client.');

    const now = await dbNow(tx);
    const check = await tx.checkSubmission.create({
      data: { postId, customerId: customer.id, url, createdAt: now },
    });

    // "Client Checking": the countdown stops until the Client reviews this submission.
    await tx.$executeRaw`
      UPDATE "Post" SET "progressingPausedAt" = ${DB_NOW}, "updatedAt" = ${DB_NOW}
      WHERE id = ${postId}`;
    pushPost(out, await tx.post.findUniqueOrThrow({ where: { id: postId }, include: postInclude }), now);

    const conv = await tx.conversation.upsert({
      where: { pairKey: `${postId}:${customer.id}` },
      create: { type: 'DEAL', postId, pairKey: `${postId}:${customer.id}` },
      update: {},
    });
    await tx.conversationParticipant.createMany({
      data: [
        { conversationId: conv.id, userId: post.clientId },
        { conversationId: conv.id, userId: customer.id, lastReadAt: now },
      ],
      skipDuplicates: true,
    });

    await addMessage(tx, out, {
      conversationId: conv.id,
      type: 'CHECK_REQUEST',
      body: url,
      senderUserId: customer.id,
      checkSubmissionId: check.id,
    });

    const label = post.name?.trim() || post.title;
    const note = {
      type: 'CHECK_SUBMITTED' as const,
      title: `${customer.name} sent a confirm URL`,
      body: `"${label}" · ${url}`,
      postId,
      conversationId: conv.id,
    };
    await notify(tx, out, { userId: post.clientId }, note);
    const admins = await tx.admin.findMany({ select: { id: true } });
    for (const admin of admins) await notify(tx, out, { adminId: admin.id }, note);

    out.push(checkRooms(post.clientId, customer.id), 'check:updated', { check: toCheckDTO(check), conversationId: conv.id });
    out.push([rooms.user(post.clientId), rooms.user(customer.id)], 'conversation:updated', { conversationId: conv.id });
    return { check: toCheckDTO(check), conversationId: conv.id };
  });
  out.flush();
  return result;
}

async function loadCheckForClient(client: UserActor, checkId: string) {
  const check = await prisma.checkSubmission.findUnique({ where: { id: checkId }, include: { post: true } });
  if (!check) throw notFound('Check');
  if (check.post.clientId !== client.id) throw forbidden('Only the link owner can review checking info.');
  return check;
}

/** Client clicks Checked: post PROGRESSING -> COMPLETED (while Client Checking, or before the deadline), submission PENDING -> CHECKED. */
export async function markChecked(client: UserActor, checkId: string) {
  const check = await loadCheckForClient(client, checkId);
  const out = new Outbox();
  const result = await prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      UPDATE "Post" SET status = 'COMPLETED', "completedAt" = ${DB_NOW}, "progressingPausedAt" = NULL, "updatedAt" = ${DB_NOW}
      WHERE id = ${check.postId} AND status = 'PROGRESSING' AND "clientId" = ${client.id}
        AND "holderId" = ${check.customerId}
        AND ("progressingPausedAt" IS NOT NULL OR "progressingExpiresAt" > ${DB_NOW})
      RETURNING id`;
    if (rows.length === 0) {
      const p = await tx.post.findUniqueOrThrow({ where: { id: check.postId } });
      if (p.status === 'COMPLETED') throw conflict('ALREADY_COMPLETED', 'This link is already completed.');
      throw conflict('TIME_EXPIRED', 'Time expired.');
    }

    const now = await dbNow(tx);
    const changed = await tx.checkSubmission.updateMany({
      where: { id: checkId, status: 'PENDING' },
      data: { status: 'CHECKED', reviewedAt: now },
    });
    if (changed.count === 0) throw conflict('CHECK_NOT_PENDING', 'This checking info was already reviewed.');

    // A completed post can't be bought again, so it leaves every Customer's cart.
    const carted = await tx.cartItem.findMany({ where: { postId: check.postId }, select: { customerId: true } });
    await tx.cartItem.deleteMany({ where: { postId: check.postId } });

    const conv = await tx.conversation.findUniqueOrThrow({ where: { pairKey: `${check.postId}:${check.customerId}` } });
    await addMessage(tx, out, { conversationId: conv.id, type: 'SYSTEM', body: 'Checked - completed.' });
    await notify(tx, out, { userId: check.customerId }, {
      type: 'CHECK_CHECKED',
      title: 'Checked - completed',
      body: `"${check.post.title}" was checked by the client.`,
      postId: check.postId,
      conversationId: conv.id,
    });

    const post = await tx.post.findUniqueOrThrow({ where: { id: check.postId }, include: postInclude });
    const fresh = await tx.checkSubmission.findUniqueOrThrow({ where: { id: checkId } });
    pushPost(out, post, now);
    out.push(checkRooms(client.id, check.customerId), 'check:updated', { check: toCheckDTO(fresh), conversationId: conv.id });
    out.push([rooms.user(client.id), rooms.user(check.customerId)], 'check:checked', {
      conversationId: conv.id,
      postId: check.postId,
    });
    return { conversationId: conv.id, cartedBy: carted.map((c) => c.customerId) };
  });
  out.flush();
  for (const customerId of result.cartedBy) {
    emit(rooms.user(customerId), 'cart:updated', await cartSnapshot(customerId));
  }
  return { conversationId: result.conversationId };
}

/** Client clicks Not checked: submission -> NOT_CHECKED; the paused countdown restarts with a full 5 minutes. */
export async function markNotChecked(client: UserActor, checkId: string) {
  const check = await loadCheckForClient(client, checkId);
  const out = new Outbox();
  const result = await prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      UPDATE "CheckSubmission" cs SET status = 'NOT_CHECKED', "reviewedAt" = ${DB_NOW}
      FROM "Post" p
      WHERE cs.id = ${checkId} AND cs.status = 'PENDING'
        AND p.id = cs."postId" AND p.status = 'PROGRESSING' AND p."clientId" = ${client.id}
        AND p."holderId" = cs."customerId"
        AND (p."progressingPausedAt" IS NOT NULL OR p."progressingExpiresAt" > ${DB_NOW})
      RETURNING cs.id`;
    if (rows.length === 0) {
      const p = await tx.post.findUniqueOrThrow({ where: { id: check.postId } });
      if (p.status === 'PROGRESSING' && (p.progressingPausedAt || (p.progressingExpiresAt && p.progressingExpiresAt > (await dbNow(tx))))) {
        throw conflict('CHECK_NOT_PENDING', 'This checking info was already reviewed.');
      }
      throw conflict('TIME_EXPIRED', 'Time expired.');
    }

    // The countdown restarts: a fresh 5 minutes to send new checking info.
    await tx.$executeRaw`
      UPDATE "Post" SET "progressingPausedAt" = NULL, "progressingExpiresAt" = ${DB_NOW} + interval '5 minutes', "updatedAt" = ${DB_NOW}
      WHERE id = ${check.postId}`;
    pushPost(out, await tx.post.findUniqueOrThrow({ where: { id: check.postId }, include: postInclude }), await dbNow(tx));

    const conv = await tx.conversation.findUniqueOrThrow({ where: { pairKey: `${check.postId}:${check.customerId}` } });
    await addMessage(tx, out, {
      conversationId: conv.id,
      type: 'SYSTEM',
      body: 'Not checked. The countdown restarted: please submit new checking info within 5 minutes.',
    });
    await notify(tx, out, { userId: check.customerId }, {
      type: 'CHECK_NOT_CHECKED',
      title: 'Not checked',
      body: `The client asked for new checking info for "${check.post.title}".`,
      postId: check.postId,
      conversationId: conv.id,
    });
    const fresh = await tx.checkSubmission.findUniqueOrThrow({ where: { id: checkId } });
    out.push(checkRooms(client.id, check.customerId), 'check:updated', { check: toCheckDTO(fresh), conversationId: conv.id });
    return { check: toCheckDTO(fresh), conversationId: conv.id };
  });
  out.flush();
  return result;
}
