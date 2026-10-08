import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/db';
import { addToCart, confirmPost, removeFromCart } from '@/server/services/posts';
import { createUser, getMe, listUsers, toUserDTO, updateUser } from '@/server/services/users';
import { makeAdmin, makeClient, makeCustomer, makePublishedPost, resetDb } from './helpers';

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

describe('cart limit', () => {
  it('defaults to 1 and is the only limit', async () => {
    const client = await makeClient();
    const [p1, p2] = [await makePublishedPost(client.id), await makePublishedPost(client.id)];
    const c = await makeCustomer();

    expect((await addToCart(c, p1.id)).count).toBe(1);
    await expect(addToCart(c, p2.id)).rejects.toMatchObject({ status: 409, code: 'CART_LIMIT_REACHED' });
    // Adding the same post again is idempotent, not an error.
    expect((await addToCart(c, p1.id)).count).toBe(1);

    await removeFromCart(c, p1.id);
    expect((await addToCart(c, p2.id)).count).toBe(1);
  });

  it('respects a higher cartLimit set by the Admin, and many Customers can cart the same post', async () => {
    const client = await makeClient();
    const posts = await Promise.all([1, 2, 3].map((i) => makePublishedPost(client.id, `P${i}`)));
    const c = await makeCustomer();
    await updateUser(c.id, { cartLimit: 2 });
    await addToCart(c, posts[0].id);
    await addToCart(c, posts[1].id);
    await expect(addToCart(c, posts[2].id)).rejects.toMatchObject({ code: 'CART_LIMIT_REACHED' });

    const others = await Promise.all([makeCustomer(), makeCustomer(), makeCustomer()]);
    for (const o of others) await addToCart(o, posts[0].id);
    expect(await prisma.cartItem.count({ where: { postId: posts[0].id } })).toBe(4);
  });

  it('parallel adds cannot exceed the limit', async () => {
    const client = await makeClient();
    const posts = await Promise.all(Array.from({ length: 10 }, (_, i) => makePublishedPost(client.id, `P${i}`)));
    const c = await makeCustomer();
    await updateUser(c.id, { cartLimit: 3 });
    const results = await Promise.allSettled(posts.map((p) => addToCart(c, p.id)));
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(3);
    expect(await prisma.cartItem.count({ where: { customerId: c.id } })).toBe(3);
  });

  it('only PUBLISHED posts can be added, and a holder cannot remove the post they are progressing', async () => {
    const client = await makeClient();
    const requested = await prisma.post.create({ data: { clientId: client.id, title: 'Pending' } });
    const c = await makeCustomer();
    await expect(addToCart(c, requested.id)).rejects.toMatchObject({ status: 404 });

    const post = await makePublishedPost(client.id);
    await addToCart(c, post.id);
    await confirmPost(c, post.id);
    await expect(removeFromCart(c, post.id)).rejects.toMatchObject({ code: 'HOLDING' });
    const other = await makeCustomer();
    await expect(addToCart(other, post.id)).rejects.toMatchObject({ code: 'POST_UNAVAILABLE' });
  });
});

describe('counts by role', () => {
  it('Clients expose only s_counts; Customers expose only b_counts and cartLimit', async () => {
    const admin = await makeAdmin();
    const client = await createUser(admin, {
      role: 'CLIENT', name: 'Seller', email: 'seller@test.dev', password: 'password123', s_counts: 7, b_counts: 99,
    });
    const customer = await createUser(admin, {
      role: 'CUSTOMER', name: 'Buyer', email: 'buyer@test.dev', password: 'password123', b_counts: 4, s_counts: 99, cartLimit: 2,
    });

    expect(client).toMatchObject({ s_counts: 7 });
    expect(client).not.toHaveProperty('b_counts');
    expect(client).not.toHaveProperty('cartLimit');
    expect(customer).toMatchObject({ b_counts: 4, cartLimit: 2 });
    expect(customer).not.toHaveProperty('s_counts');

    // Fields for the other role are ignored, not stored.
    const rawClient = await prisma.user.findUniqueOrThrow({ where: { id: client.id } });
    const rawCustomer = await prisma.user.findUniqueOrThrow({ where: { id: customer.id } });
    expect(rawClient.b_counts).toBe(0);
    expect(rawCustomer.s_counts).toBe(0);

    const updated = await updateUser(client.id, { s_counts: 8, b_counts: 50 });
    expect(updated).toMatchObject({ s_counts: 8 });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: client.id } })).b_counts).toBe(0);

    const me = await getMe({ kind: 'user', id: customer.id, role: 'CUSTOMER', name: 'Buyer', email: 'buyer@test.dev' });
    expect(me).toHaveProperty('b_counts', 4);
    expect(me).not.toHaveProperty('s_counts');

    for (const u of await listUsers()) {
      expect(u.role === 'CLIENT' ? 's_counts' in u && !('b_counts' in u) : 'b_counts' in u && !('s_counts' in u)).toBe(true);
    }
  });

  it('defaults are 0 counts and cartLimit 1', async () => {
    const c = await makeCustomer();
    const dto = toUserDTO(await prisma.user.findUniqueOrThrow({ where: { id: c.id } }));
    expect(dto).toMatchObject({ b_counts: 0, cartLimit: 1 });
  });
});
