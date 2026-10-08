import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/db';
import { POST as confirmRoute } from '@/app/api/posts/[id]/confirm/route';
import { addToCartDirect, apiRequest, makeClient, makeCustomer, makePublishedPost, resetDb, sessionCookie } from './helpers';

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

describe('concurrent Confirm', () => {
  it('50 Customers confirm one post at once: exactly 1 x 200, 49 x 409, one holderId', async () => {
    const client = await makeClient();
    const post = await makePublishedPost(client.id);
    const customers = await Promise.all(Array.from({ length: 50 }, () => makeCustomer()));
    for (const c of customers) await addToCartDirect(c.id, post.id);
    const cookies = await Promise.all(customers.map((c) => sessionCookie({ kind: 'user', id: c.id })));

    const responses = await Promise.all(
      customers.map((_, i) =>
        confirmRoute(apiRequest(`/api/posts/${post.id}/confirm`, { method: 'POST', cookie: cookies[i] }), {
          params: { id: post.id },
        }),
      ),
    );

    const statuses = responses.map((r) => r.status);
    expect(statuses.filter((s) => s === 200)).toHaveLength(1);
    expect(statuses.filter((s) => s === 409)).toHaveLength(49);

    const losers = await Promise.all(responses.filter((r) => r.status === 409).map((r) => r.json()));
    for (const body of losers) {
      expect(body.code).toBe('ALREADY_PROGRESSING');
      expect(body.post.status).toBe('PROGRESSING');
    }

    const winnerIndex = statuses.indexOf(200);
    const winner = await responses[winnerIndex].json();
    expect(winner.client.name).toBe(client.name);
    expect(winner.price).toBe(35.01);
    expect(new Date(winner.progressingExpiresAt).getTime() - new Date(winner.serverNow).getTime()).toBeGreaterThan(299_000);

    const row = await prisma.post.findUniqueOrThrow({ where: { id: post.id } });
    expect(row.status).toBe('PROGRESSING');
    expect(row.holderId).toBe(customers[winnerIndex].id);
    expect(await prisma.post.count({ where: { id: post.id, holderId: { not: null } } })).toBe(1);
    // Countdown is exactly 5 minutes on the database clock.
    expect(row.progressingExpiresAt!.getTime() - row.progressingAt!.getTime()).toBe(5 * 60_000);
  });

  it('rejects a Customer who does not have the post in their cart', async () => {
    const client = await makeClient();
    const post = await makePublishedPost(client.id);
    const c = await makeCustomer();
    const res = await confirmRoute(
      apiRequest(`/api/posts/${post.id}/confirm`, { method: 'POST', cookie: await sessionCookie({ kind: 'user', id: c.id }) }),
      { params: { id: post.id } },
    );
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('NOT_IN_CART');
    expect((await prisma.post.findUniqueOrThrow({ where: { id: post.id } })).holderId).toBeNull();
  });

  it('the database rejects a PROGRESSING post without a holder (CHECK constraint)', async () => {
    const client = await makeClient();
    const post = await makePublishedPost(client.id);
    await expect(
      prisma.$executeRaw`UPDATE "Post" SET status = 'PROGRESSING', "progressingAt" = now(), "progressingExpiresAt" = now() WHERE id = ${post.id}`,
    ).rejects.toThrow(/post_holder_check/);
  });
});
