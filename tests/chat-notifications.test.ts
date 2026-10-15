import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/db';
import { confirmPost } from '@/server/services/posts';
import { markChecked } from '@/server/services/checks';
import { markConversationRead, sendFile, sendMessage, startAdminConversation } from '@/server/services/chat';
import { addToCartDirect, makeAdmin, makeClient, makeCustomer, makePublishedPost, resetDb, submitPaidCheck } from './helpers';

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

// 1x1 PNG
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

const unreadNewMessages = (where: { userId?: string; adminId?: string }, conversationId: string) =>
  prisma.notification.count({ where: { ...where, conversationId, type: 'NEW_MESSAGE', readAt: null } });

describe('chat notifications', () => {
  it('every message in a deal chat notifies the other side; the sender gets nothing', async () => {
    const client = await makeClient();
    const customer = await makeCustomer();
    const post = await makePublishedPost(client.id);
    await addToCartDirect(customer.id, post.id);
    await confirmPost(customer, post.id);
    const { check, conversationId } = await submitPaidCheck(customer, post.id, 'https://example.com/proof');
    await markChecked(client, check.id);

    await sendMessage(client, conversationId, 'one');
    await sendMessage(client, conversationId, 'two');
    await sendFile(client, conversationId, { buf: PNG, name: 'photo.png' }, 'see attached');

    expect(await unreadNewMessages({ userId: customer.id }, conversationId)).toBe(3);
    expect(await unreadNewMessages({ userId: client.id }, conversationId)).toBe(0);
    const file = await prisma.notification.findFirstOrThrow({
      where: { userId: customer.id, conversationId, body: { contains: 'Sent a file' } },
    });
    expect(file.body).toBe('Test post: Sent a file: photo.png - see attached');

    await sendMessage(customer, conversationId, 'thanks');
    expect(await unreadNewMessages({ userId: client.id }, conversationId)).toBe(1);

    // Opening the chat clears all of its message notifications at once.
    await markConversationRead(customer, conversationId);
    expect(await unreadNewMessages({ userId: customer.id }, conversationId)).toBe(0);
  });

  it('support chats notify in both directions (Admin and User)', async () => {
    const admin = await makeAdmin();
    const customer = await makeCustomer();
    const { conversationId } = await startAdminConversation(admin, customer.id);

    await sendMessage(admin, conversationId, 'Hi, how can I help?');
    await sendMessage(admin, conversationId, 'Are you there?');
    await sendMessage(customer, conversationId, 'Yes!');

    expect(await unreadNewMessages({ userId: customer.id }, conversationId)).toBe(2);
    expect(await unreadNewMessages({ adminId: admin.id }, conversationId)).toBe(1);
  });
});
