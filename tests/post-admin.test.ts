import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/db';
import {
  addToCart,
  confirmPost,
  createPostByAdmin,
  deletePostByAdmin,
  deleteRequestedPost,
  getPostForCustomer,
  listClientPosts,
  listFeed,
  setPostVisibility,
  updatePostByAdmin,
} from '@/server/services/posts';
import { adminPostUpdateSchema } from '@/lib/validation';
import { addToCartDirect, makeAdmin, makeClient, makeCustomer, makePublishedPost, resetDb, submitPaidCheck } from './helpers';

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

describe('post visibility (enable / disable)', () => {
  it('a hidden post disappears for Customers but not for its Client', async () => {
    const client = await makeClient();
    const customer = await makeCustomer();
    const post = await makePublishedPost(client.id, 'Hidden one');

    await setPostVisibility(post.id, false);

    expect((await listFeed(customer)).posts.map((p) => p.id)).not.toContain(post.id);
    await expect(getPostForCustomer(customer, post.id)).rejects.toMatchObject({ status: 404 });
    await expect(addToCart(customer, post.id)).rejects.toMatchObject({ status: 404 });

    const mine = (await listClientPosts(client)).posts.find((p) => p.id === post.id);
    expect(mine).toMatchObject({ visible: false, status: 'PUBLISHED' });

    await setPostVisibility(post.id, true);
    expect((await listFeed(customer)).posts.map((p) => p.id)).toContain(post.id);
  });

  it('hiding removes the post from every cart, and a cart item cannot be confirmed while hidden', async () => {
    const client = await makeClient();
    const [a, b] = [await makeCustomer(), await makeCustomer()];
    const post = await makePublishedPost(client.id);
    await addToCartDirect(a.id, post.id);
    await addToCartDirect(b.id, post.id);

    await setPostVisibility(post.id, false);
    expect(await prisma.cartItem.count({ where: { postId: post.id } })).toBe(0);

    // Even with a stale cart row, confirm refuses a hidden post.
    await addToCartDirect(a.id, post.id);
    await expect(confirmPost(a, post.id)).rejects.toMatchObject({ status: 404 });
    expect((await prisma.post.findUniqueOrThrow({ where: { id: post.id } })).status).toBe('PUBLISHED');
  });

  it('a post on hold cannot be hidden, and requests cannot be hidden', async () => {
    const client = await makeClient();
    const customer = await makeCustomer();
    const post = await makePublishedPost(client.id);
    await addToCartDirect(customer.id, post.id);
    await confirmPost(customer, post.id);
    await expect(setPostVisibility(post.id, false)).rejects.toMatchObject({ code: 'IN_PROGRESS' });

    const request = await prisma.post.create({ data: { clientId: client.id, title: 'Pending' } });
    await expect(setPostVisibility(request.id, false)).rejects.toMatchObject({ code: 'NOT_ACCEPTED' });
  });

  it("a Customer still sees accounts they bought even if hidden later", async () => {
    const client = await makeClient();
    const customer = await makeCustomer();
    const post = await makePublishedPost(client.id);
    await prisma.post.update({
      where: { id: post.id },
      data: { status: 'COMPLETED', holderId: customer.id, completedAt: new Date() },
    });
    await setPostVisibility(post.id, false);
    expect((await listFeed(customer)).posts.map((p) => p.id)).toContain(post.id);
  });
});

describe('delete post requests', () => {
  it('deletes a request, but never an accepted post', async () => {
    const client = await makeClient();
    const request = await prisma.post.create({ data: { clientId: client.id, title: 'Delete me' } });
    await deleteRequestedPost(request.id);
    expect(await prisma.post.findUnique({ where: { id: request.id } })).toBeNull();

    const accepted = await makePublishedPost(client.id);
    await expect(deleteRequestedPost(accepted.id)).rejects.toMatchObject({ status: 409, code: 'NOT_REQUESTED' });
    expect(await prisma.post.findUnique({ where: { id: accepted.id } })).not.toBeNull();

    await expect(deleteRequestedPost('missing')).rejects.toMatchObject({ status: 404 });
  });
});

describe('post name', () => {
  it('the Admin sets and clears a display name', async () => {
    const client = await makeClient();
    const post = await prisma.post.create({ data: { clientId: client.id, title: 'http://linkedin.com/in/someone' } });

    const set = adminPostUpdateSchema.parse({ name: '  Senior developer  ' });
    expect((await updatePostByAdmin(post.id, set)).post).toMatchObject({ name: 'Senior developer', title: 'http://linkedin.com/in/someone' });

    const cleared = adminPostUpdateSchema.parse({ name: '' });
    expect((await updatePostByAdmin(post.id, cleared)).post.name).toBeNull();
  });
});

describe('progressing notification', () => {
  it('notifies every Admin when a Customer starts progressing', async () => {
    const admin = await makeAdmin();
    const client = await makeClient();
    const customer = await makeCustomer();
    const post = await makePublishedPost(client.id, 'Account #1042');
    await addToCartDirect(customer.id, post.id);

    await confirmPost(customer, post.id);

    const n = await prisma.notification.findFirstOrThrow({ where: { adminId: admin.id, type: 'POST_PROGRESSING' } });
    expect(n.title).toBe(`${customer.name} is progressing`);
    expect(n.body).toBe('"Account #1042" is on hold for 5 minutes.');
    expect(n.postId).toBe(post.id);
  });
});

describe('detail image', () => {
  it('the Admin can add and remove an optional detail image; Customers receive it', async () => {
    const client = await makeClient();
    const customer = await makeCustomer();
    const post = await makePublishedPost(client.id);
    expect((await listFeed(customer)).posts.find((p) => p.id === post.id)?.detailImage).toBeNull();

    const detailImage = { url: '/uploads/images/d.png', key: 'images/d.png', mimeType: 'image/png' as const, size: 1000, width: 1200, height: 800 };
    const set = adminPostUpdateSchema.parse({ detailImage });
    expect((await updatePostByAdmin(post.id, set)).post.detailImage).toMatchObject({ url: detailImage.url });
    expect((await listFeed(customer)).posts.find((p) => p.id === post.id)?.detailImage).toMatchObject({ url: detailImage.url });

    // Saving without the field keeps it; null removes it.
    await updatePostByAdmin(post.id, adminPostUpdateSchema.parse({ price: 12 }));
    expect((await prisma.post.findUniqueOrThrow({ where: { id: post.id } })).detailImage).toMatchObject({ key: detailImage.key });
    expect((await updatePostByAdmin(post.id, adminPostUpdateSchema.parse({ detailImage: null }))).post.detailImage).toBeNull();
  });
});

describe('admin adds an account', () => {
  it('is accepted and live at once, and the seller is told', async () => {
    const admin = await makeAdmin();
    const client = await makeClient();
    const customer = await makeCustomer();
    const { post } = await createPostByAdmin(admin, { clientId: client.id, kind: 'LINKEDIN', title: 'https://linkedin.com/in/new', name: 'New One', connects: 120, price: 25 });
    expect(post).toMatchObject({ status: 'PUBLISHED', approval: true, visible: true, name: 'New One', clientId: client.id });
    expect(await prisma.postApproval.count({ where: { postId: post.id, adminId: admin.id } })).toBe(1);
    expect((await listFeed(customer)).posts.some((p) => p.id === post.id)).toBe(true);
    expect(await prisma.notification.count({ where: { userId: client.id, type: 'POST_ACCEPTED', postId: post.id } })).toBe(1);
  });

  it("refuses a seller who doesn't sell that account type", async () => {
    const admin = await makeAdmin();
    const client = await makeClient(); // LinkedIn only
    await expect(createPostByAdmin(admin, { clientId: client.id, kind: 'GMAIL', title: 'a@gmail.com', price: 3 })).rejects.toMatchObject({ code: 'SELLER_KIND' });
  });
});

describe('admin edits and deletes accounts', () => {
  it('deletes a published account and takes it out of carts', async () => {
    const client = await makeClient();
    const customer = await makeCustomer();
    const post = await makePublishedPost(client.id);
    await addToCartDirect(customer.id, post.id);
    await deletePostByAdmin(post.id);
    expect(await prisma.post.count({ where: { id: post.id } })).toBe(0);
    expect(await prisma.cartItem.count({ where: { postId: post.id } })).toBe(0);
    expect(await prisma.notification.count({ where: { userId: client.id, type: 'POST_DELETED' } })).toBe(1);
  });

  it('deletes a completed account but keeps its deal chat', async () => {
    const { markChecked } = await import('@/server/services/checks');
    const client = await makeClient();
    const customer = await makeCustomer();
    const post = await makePublishedPost(client.id);
    await addToCartDirect(customer.id, post.id);
    await confirmPost(customer, post.id);
    const { check, conversationId } = await submitPaidCheck(customer, post.id, 'https://example.com/proof');
    await markChecked(client, check.id);
    await deletePostByAdmin(post.id);
    expect(await prisma.post.count({ where: { id: post.id } })).toBe(0);
    const conv = await prisma.conversation.findUniqueOrThrow({ where: { id: conversationId } });
    expect(conv.postId).toBeNull();
    expect(await prisma.message.count({ where: { conversationId } })).toBeGreaterThan(0);
  });

  it('an account a buyer is holding can be neither deleted nor edited', async () => {
    const client = await makeClient();
    const customer = await makeCustomer();
    const post = await makePublishedPost(client.id);
    await addToCartDirect(customer.id, post.id);
    await confirmPost(customer, post.id);
    await expect(deletePostByAdmin(post.id)).rejects.toMatchObject({ code: 'IN_PROGRESS' });
    await expect(updatePostByAdmin(post.id, adminPostUpdateSchema.parse({ price: 1 }))).rejects.toMatchObject({ code: 'IN_PROGRESS' });
  });
});

