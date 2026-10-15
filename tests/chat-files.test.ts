import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/db';
import { sniffChatFile } from '@/lib/storage';
import { getChatFile, listMyConversations, sendFile, sendMessage, startAdminConversation } from '@/server/services/chat';
import { confirmPost } from '@/server/services/posts';
import { markChecked } from '@/server/services/checks';
import { addToCartDirect, makeAdmin, makeClient, makeCustomer, makePublishedPost, resetDb, submitPaidCheck } from './helpers';

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

// 1x1 PNG
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6300010000050001' + '0d0a2db40000000049454e44ae426082', 'hex');
const PDF = Buffer.from('%PDF-1.4\n%test\n');

async function dealChat() {
  const client = await makeClient();
  const customer = await makeCustomer();
  const post = await makePublishedPost(client.id, 'Account #2001');
  await addToCartDirect(customer.id, post.id);
  await confirmPost(customer, post.id);
  const { check, conversationId } = await submitPaidCheck(customer, post.id, 'https://example.com/a');
  return { client, customer, post, check, conversationId };
}

describe('file type detection', () => {
  it('accepts images, PDF, Office/ZIP by signature + extension, and plain text', () => {
    expect(sniffChatFile(PNG, 'a.png')?.mimeType).toBe('image/png');
    expect(sniffChatFile(PDF, 'invoice.pdf')?.mimeType).toBe('application/pdf');
    expect(sniffChatFile(Buffer.from('PK\x03\x04rest'), 'report.docx')?.ext).toBe('docx');
    expect(sniffChatFile(Buffer.from('hello'), 'notes.txt')?.mimeType).toBe('text/plain');
  });
  it('rejects executables, HTML and mislabeled files', () => {
    expect(sniffChatFile(Buffer.from('MZ\x90\x00'), 'setup.exe')).toBeNull();
    expect(sniffChatFile(Buffer.from('<html><script>alert(1)</script>'), 'page.html')).toBeNull();
    expect(sniffChatFile(Buffer.from('PK\x03\x04rest'), 'app.apk')).toBeNull();
    expect(sniffChatFile(Buffer.from('a\x00b'), 'fake.txt')).toBeNull();
  });
});

describe('sending files', () => {
  it('a Client sends a file with a caption; members can read it, the list shows a preview', async () => {
    const { client, customer, conversationId } = await dealChat();
    const { message } = await sendFile(client, conversationId, { buf: PDF, name: 'contract.pdf' }, 'Here you go 👍');
    expect(message).toMatchObject({ type: 'FILE', body: 'Here you go 👍', attachment: { name: 'contract.pdf', mimeType: 'application/pdf', isImage: false } });
    expect(message.attachment!.url).toBe(`/api/conversations/${conversationId}/messages/${message.id}/file`);

    const f = await getChatFile(customer, conversationId, message.id);
    expect(f.buf.equals(PDF)).toBe(true);

    const { conversations } = await listMyConversations(customer);
    expect(conversations[0].lastMessage?.body).toBe('📎 contract.pdf');
  });

  it('a deal-chat Customer cannot send files before Checked (same rule as text), and can after', async () => {
    const { client, customer, check, conversationId } = await dealChat();
    await expect(sendFile(customer, conversationId, { buf: PNG, name: 'shot.png' }, null)).rejects.toMatchObject({ code: 'CHECK_REQUIRED' });
    expect(await prisma.message.count({ where: { conversationId, type: 'FILE' } })).toBe(0);

    await markChecked(client, check.id);
    const { message } = await sendFile(customer, conversationId, { buf: PNG, name: 'shot.png' }, null);
    expect(message.attachment).toMatchObject({ isImage: true, width: 1, height: 1 });
  });

  it('non-members cannot download, and unsupported types are refused', async () => {
    const { client, conversationId } = await dealChat();
    const outsider = await makeCustomer();
    const { message } = await sendFile(client, conversationId, { buf: PDF, name: 'a.pdf' }, null);
    await expect(getChatFile(outsider, conversationId, message.id)).rejects.toMatchObject({ status: 403 });
    await expect(sendFile(client, conversationId, { buf: Buffer.from('MZ'), name: 'x.exe' }, null)).rejects.toMatchObject({ code: 'UNSUPPORTED_TYPE' });
  });

  it('emoji text messages are stored as typed', async () => {
    const admin = await makeAdmin();
    const user = await makeCustomer();
    const { conversationId } = await startAdminConversation(admin, user.id);
    const { message } = await sendMessage(user, conversationId, 'Thanks 😀🎉');
    expect(message.body).toBe('Thanks 😀🎉');
  });
});
