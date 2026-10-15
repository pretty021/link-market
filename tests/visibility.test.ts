import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/db';
import { GET as checkRoute } from '@/app/api/checks/[id]/route';
import { GET as messagesRoute, POST as sendRoute } from '@/app/api/conversations/[id]/messages/route';
import { GET as adminMessagesRoute } from '@/app/api/admin/conversations/[id]/messages/route';
import { POST as checkedRoute } from '@/app/api/checks/[id]/checked/route';
import { confirmPost } from '@/server/services/posts';
import { listAllConversations, startAdminConversation } from '@/server/services/chat';
import { addToCartDirect, apiRequest, makeAdmin, makeClient, makeCustomer, makePublishedPost, resetDb, sessionCookie, submitPaidCheck } from './helpers';

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

async function scenario() {
  const admin = await makeAdmin();
  const client = await makeClient();
  const otherClient = await makeClient();
  const holder = await makeCustomer();
  const other = await makeCustomer();
  const post = await makePublishedPost(client.id);
  await addToCartDirect(holder.id, post.id);
  await addToCartDirect(other.id, post.id);
  await confirmPost(holder, post.id);
  const { check, conversationId } = await submitPaidCheck(holder, post.id, 'https://example.com/secret-proof');
  const cookies = {
    admin: await sessionCookie({ kind: 'admin', id: admin.id }),
    client: await sessionCookie({ kind: 'user', id: client.id }),
    otherClient: await sessionCookie({ kind: 'user', id: otherClient.id }),
    holder: await sessionCookie({ kind: 'user', id: holder.id }),
    other: await sessionCookie({ kind: 'user', id: other.id }),
  };
  return { admin, client, holder, other, post, check, conversationId, cookies };
}

const getCheck = (id: string, cookie: string) => checkRoute(apiRequest(`/api/checks/${id}`, { cookie }), { params: { id } });

describe('CheckStatus visibility', () => {
  it('only the holder, the post Client and the Admin can read a CheckSubmission', async () => {
    const { check, cookies } = await scenario();
    for (const who of ['holder', 'client', 'admin'] as const) {
      const res = await getCheck(check.id, cookies[who]);
      expect(res.status).toBe(200);
      expect((await res.json()).check.status).toBe('PENDING');
    }
    expect((await getCheck(check.id, cookies.other)).status).toBe(403);
    expect((await getCheck(check.id, cookies.otherClient)).status).toBe(403);
    expect((await getCheck(check.id, '')).status).toBe(401);
  });

  it('the Admin can view checks but cannot click Checked; neither can the Customer', async () => {
    const { check, cookies } = await scenario();
    const asAdmin = await checkedRoute(apiRequest(`/api/checks/${check.id}/checked`, { method: 'POST', cookie: cookies.admin }), {
      params: { id: check.id },
    });
    expect(asAdmin.status).toBe(403);
    const asHolder = await checkedRoute(apiRequest(`/api/checks/${check.id}/checked`, { method: 'POST', cookie: cookies.holder }), {
      params: { id: check.id },
    });
    expect(asHolder.status).toBe(403);
    expect((await prisma.checkSubmission.findUniqueOrThrow({ where: { id: check.id } })).status).toBe('PENDING');
  });
});

describe('chat access', () => {
  const read = (id: string, cookie: string) =>
    messagesRoute(apiRequest(`/api/conversations/${id}/messages`, { cookie }), { params: { id } });

  it('participants can read; other Clients and Customers get 403', async () => {
    const { conversationId, cookies } = await scenario();
    expect((await read(conversationId, cookies.holder)).status).toBe(200);
    expect((await read(conversationId, cookies.client)).status).toBe(200);
    expect((await read(conversationId, cookies.other)).status).toBe(403);
    expect((await read(conversationId, cookies.otherClient)).status).toBe(403);
    const send = await sendRoute(
      apiRequest(`/api/conversations/${conversationId}/messages`, { method: 'POST', cookie: cookies.other, json: { body: 'hi' } }),
      { params: { id: conversationId } },
    );
    expect(send.status).toBe(403);
  });

  it('the Admin can read every conversation, deal chats are read-only, and reading changes no unread counts', async () => {
    const { admin, holder, conversationId, cookies } = await scenario();
    const before = await prisma.conversationParticipant.findMany({ where: { conversationId }, orderBy: { id: 'asc' } });

    const res = await adminMessagesRoute(apiRequest(`/api/admin/conversations/${conversationId}/messages`, { cookie: cookies.admin }), {
      params: { id: conversationId },
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.readOnly).toBe(true);
    expect(data.messages.some((m: { type: string }) => m.type === 'CHECK_REQUEST')).toBe(true);

    const send = await sendRoute(
      apiRequest(`/api/conversations/${conversationId}/messages`, { method: 'POST', cookie: cookies.admin, json: { body: 'hi' } }),
      { params: { id: conversationId } },
    );
    expect(send.status).toBe(403);

    const after = await prisma.conversationParticipant.findMany({ where: { conversationId }, orderBy: { id: 'asc' } });
    expect(after).toEqual(before);
    expect(after.some((p) => p.adminId)).toBe(false);

    // Admin support chats are writable, and appear in the all-chats list alongside deal chats.
    const { conversationId: supportId } = await startAdminConversation(admin, holder.id);
    const ok = await sendRoute(
      apiRequest(`/api/conversations/${supportId}/messages`, { method: 'POST', cookie: cookies.admin, json: { body: 'Hello from support' } }),
      { params: { id: supportId } },
    );
    expect(ok.status).toBe(200);
    const all = await listAllConversations(admin, {});
    expect(all.conversations.map((c) => c.type).sort()).toEqual(['ADMIN_CUSTOMER', 'DEAL']);
    expect((await listAllConversations(admin, { type: 'DEAL' })).conversations).toHaveLength(1);
  });

  it('other Customers never receive check details through the post', async () => {
    const { other, post } = await scenario();
    const { listChecksForPost } = await import('@/server/services/checks');
    await expect(listChecksForPost(other, post.id)).rejects.toMatchObject({ status: 403 });
  });
});
