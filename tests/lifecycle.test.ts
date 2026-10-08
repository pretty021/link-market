import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/db';
import { addToCart, confirmPost, expireDue, getCart } from '@/server/services/posts';
import { markChecked, markNotChecked, submitCheck } from '@/server/services/checks';
import { sendMessage } from '@/server/services/chat';
import { addToCartDirect, makeClient, makeCustomer, makePublishedPost, resetDb, setExpiresIn } from './helpers';

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

async function setup() {
  const client = await makeClient();
  const holder = await makeCustomer();
  const other = await makeCustomer();
  const post = await makePublishedPost(client.id, 'Account #1042');
  await addToCartDirect(holder.id, post.id);
  await addToCartDirect(other.id, post.id);
  await confirmPost(holder, post.id);
  return { client, holder, other, post };
}

describe('countdown expiry', () => {
  it('returns the post to PUBLISHED and lets another Customer confirm it', async () => {
    const { client, holder, other, post } = await setup();
    const { check, conversationId } = await submitCheck(holder, post.id, 'https://example.com/a');
    await setExpiresIn(post.id, -10);

    expect(await expireDue()).toEqual([post.id]);

    const row = await prisma.post.findUniqueOrThrow({ where: { id: post.id } });
    expect(row).toMatchObject({
      status: 'PUBLISHED',
      holderId: null,
      approval: true,
      progressingAt: null,
      progressingExpiresAt: null,
    });
    expect((await prisma.checkSubmission.findUniqueOrThrow({ where: { id: check.id } })).status).toBe('EXPIRED');
    expect(await prisma.cartItem.count({ where: { postId: post.id } })).toBe(2);

    const notes = await prisma.notification.findMany({ where: { type: 'POST_EXPIRED', postId: post.id } });
    expect(notes.map((n) => n.userId).sort()).toEqual([client.id, holder.id].sort());

    const last = await prisma.message.findFirstOrThrow({ where: { conversationId }, orderBy: { createdAt: 'desc' } });
    expect(last).toMatchObject({ type: 'SYSTEM', body: 'Time expired. This post is available again.' });

    // A second expiry run is a no-op.
    expect(await expireDue()).toEqual([]);

    const again = await confirmPost(other, post.id);
    expect(again.post.status).toBe('PROGRESSING');
    expect((await prisma.post.findUniqueOrThrow({ where: { id: post.id } })).holderId).toBe(other.id);
  });

  it('reading the cart runs the expiry first', async () => {
    const { holder, post } = await setup();
    await setExpiresIn(post.id, -10);
    const cart = await getCart(holder);
    expect(cart.items[0].post.status).toBe('PUBLISHED');
    expect(cart.items[0].heldByMe).toBe(false);
  });
});

describe('checking info', () => {
  it('notifies the Client with CHECK_SUBMITTED when a Customer submits', async () => {
    const { client, holder, post } = await setup();
    const { conversationId } = await submitCheck(holder, post.id, 'https://example.com/proof');
    const n = await prisma.notification.findFirstOrThrow({ where: { userId: client.id, type: 'CHECK_SUBMITTED' } });
    expect(n.title).toBe(`${holder.name} sent checking info for Account #1042`);
    expect(n.conversationId).toBe(conversationId);

    const msg = await prisma.message.findFirstOrThrow({ where: { conversationId, type: 'CHECK_REQUEST' } });
    expect(msg.body).toBe('https://example.com/proof');
    expect(await prisma.conversationParticipant.count({ where: { conversationId } })).toBe(2);
  });

  it('only the holder can submit, and only one pending submission at a time', async () => {
    const { other, holder, post } = await setup();
    await expect(submitCheck(other, post.id, 'https://x.dev')).rejects.toMatchObject({ code: 'NOT_HOLDER' });
    await submitCheck(holder, post.id, 'https://x.dev/1');
    await expect(submitCheck(holder, post.id, 'https://x.dev/2')).rejects.toMatchObject({ code: 'CHECK_PENDING' });
  });

  it('Checked stops the countdown, completes the post, returns the deal chat and notifies the Customer', async () => {
    const { client, holder, post } = await setup();
    const { check, conversationId } = await submitCheck(holder, post.id, 'https://example.com/proof');

    const res = await markChecked(client, check.id);
    expect(res.conversationId).toBe(conversationId);

    const row = await prisma.post.findUniqueOrThrow({ where: { id: post.id } });
    expect(row.status).toBe('COMPLETED');
    expect(row.completedAt).not.toBeNull();
    expect(row.holderId).toBe(holder.id);
    expect((await prisma.checkSubmission.findUniqueOrThrow({ where: { id: check.id } })).status).toBe('CHECKED');
    expect(await prisma.notification.count({ where: { userId: holder.id, type: 'CHECK_CHECKED', conversationId } })).toBe(1);
    expect(
      await prisma.message.count({ where: { conversationId, type: 'SYSTEM', body: 'Checked - completed.' } }),
    ).toBe(1);

    // Double click: second Checked is rejected and changes nothing.
    await expect(markChecked(client, check.id)).rejects.toMatchObject({ status: 409 });
    // Even after the old deadline passes, a COMPLETED post never expires.
    await setExpiresIn(post.id, -10);
    expect(await expireDue()).toEqual([]);
  });

  it('Checked removes the post from every Customer cart, and a completed post cannot be carted again', async () => {
    const { client, holder, other, post } = await setup();
    // `other` also has an unrelated post in their cart, which must stay.
    await prisma.user.update({ where: { id: other.id }, data: { cartLimit: 2 } });
    const unrelated = await makePublishedPost(client.id, 'Another listing');
    await addToCart(other, unrelated.id);

    const { check } = await submitCheck(holder, post.id, 'https://example.com/proof');
    expect(await prisma.cartItem.count({ where: { postId: post.id } })).toBe(2);

    await markChecked(client, check.id);

    expect(await prisma.cartItem.count({ where: { postId: post.id } })).toBe(0);
    expect(await prisma.cartItem.findMany({ where: { customerId: other.id }, select: { postId: true } })).toEqual([
      { postId: unrelated.id },
    ]);
    expect((await getCart(holder)).items).toHaveLength(0);

    for (const c of [holder, other, await makeCustomer()]) {
      await expect(addToCart(c, post.id)).rejects.toMatchObject({ status: 409, code: 'POST_COMPLETED' });
    }
    expect(await prisma.cartItem.count({ where: { postId: post.id } })).toBe(0);
  });

  it('expiry (not completed) keeps cart items', async () => {
    const { holder, post } = await setup();
    await setExpiresIn(post.id, -10);
    await expireDue();
    expect(await prisma.cartItem.count({ where: { postId: post.id } })).toBe(2);
    expect((await getCart(holder)).items).toHaveLength(1);
  });

  it('Not checked keeps the post PROGRESSING and does not restart the countdown', async () => {
    const { client, holder, post } = await setup();
    const before = await prisma.post.findUniqueOrThrow({ where: { id: post.id } });
    const first = await submitCheck(holder, post.id, 'https://example.com/1');

    await markNotChecked(client, first.check.id);
    expect(await prisma.notification.count({ where: { userId: holder.id, type: 'CHECK_NOT_CHECKED' } })).toBe(1);
    await expect(markNotChecked(client, first.check.id)).rejects.toMatchObject({ code: 'CHECK_NOT_PENDING' });

    const second = await submitCheck(holder, post.id, 'https://example.com/2');
    expect(second.conversationId).toBe(first.conversationId);
    expect(await prisma.notification.count({ where: { userId: client.id, type: 'CHECK_SUBMITTED' } })).toBe(2);

    const after = await prisma.post.findUniqueOrThrow({ where: { id: post.id } });
    expect(after.status).toBe('PROGRESSING');
    expect(after.progressingAt!.getTime()).toBe(before.progressingAt!.getTime());
    expect(after.progressingExpiresAt!.getTime()).toBe(before.progressingExpiresAt!.getTime());
  });

  it('the Customer can send text in the deal chat only after Checked', async () => {
    const { client, holder, post } = await setup();
    const { check, conversationId } = await submitCheck(holder, post.id, 'https://example.com/proof');
    await expect(sendMessage(holder, conversationId, 'hello')).rejects.toMatchObject({ code: 'CHECK_REQUIRED' });
    await sendMessage(client, conversationId, 'Looking now');
    await markChecked(client, check.id);
    const sent = await sendMessage(holder, conversationId, 'Thanks!');
    expect(sent.message.body).toBe('Thanks!');
  });
});
