import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/db';
import { cancelHold, confirmPost } from '@/server/services/posts';
import { markChecked } from '@/server/services/checks';
import { addToCartDirect, makeClient, makeCustomer, makePublishedPost, resetDb, submitPaidCheck } from './helpers';

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

async function setup() {
  const client = await makeClient();
  const holder = await makeCustomer();
  const other = await makeCustomer();
  const post = await makePublishedPost(client.id, 'Account #1044');
  await addToCartDirect(holder.id, post.id);
  await addToCartDirect(other.id, post.id);
  await confirmPost(holder, post.id);
  return { client, holder, other, post };
}

describe('cancel a hold', () => {
  it('returns the post to PUBLISHED (approved) and lets another Customer confirm it', async () => {
    const { holder, other, post } = await setup();
    const r = await cancelHold(holder, post.id);
    expect(r.post.status).toBe('PUBLISHED');

    const row = await prisma.post.findUniqueOrThrow({ where: { id: post.id } });
    expect(row).toMatchObject({ status: 'PUBLISHED', approval: true, holderId: null, progressingAt: null, progressingExpiresAt: null });
    expect(await prisma.cartItem.count({ where: { postId: post.id } })).toBe(2);

    await expect(confirmPost(other, post.id)).resolves.toMatchObject({ post: { status: 'PROGRESSING', holderId: other.id } });
  });

  it('closes pending checking info, posts a system message and notifies the Client', async () => {
    const { client, holder, post } = await setup();
    const { check, conversationId } = await submitPaidCheck(holder, post.id, 'https://example.com/a');

    await cancelHold(holder, post.id);

    expect((await prisma.checkSubmission.findUniqueOrThrow({ where: { id: check.id } })).status).toBe('EXPIRED');
    const last = await prisma.message.findFirst({ where: { conversationId }, orderBy: { createdAt: 'desc' } });
    expect(last).toMatchObject({ type: 'SYSTEM', body: expect.stringContaining('cancelled') });
    expect(await prisma.notification.count({ where: { userId: client.id, postId: post.id, title: 'Hold cancelled' } })).toBe(1);
  });

  it('only the current holder can cancel, and not after the post is completed', async () => {
    const { client, holder, other, post } = await setup();
    await expect(cancelHold(other, post.id)).rejects.toMatchObject({ code: 'NOT_HOLDING' });

    const { check } = await submitPaidCheck(holder, post.id, 'https://example.com/a');
    await markChecked(client, check.id);
    await expect(cancelHold(holder, post.id)).rejects.toMatchObject({ code: 'POST_COMPLETED' });
    expect((await prisma.post.findUniqueOrThrow({ where: { id: post.id } })).status).toBe('COMPLETED');
  });
});
