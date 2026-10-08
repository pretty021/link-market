import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/db';
import { HttpError } from '@/lib/errors';
import { confirmPost, expireDue } from '@/server/services/posts';
import { markChecked, submitCheck } from '@/server/services/checks';
import { addToCartDirect, makeClient, makeCustomer, makePublishedPost, resetDb, setExpiresIn, sleep } from './helpers';

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

async function progressingWithPendingCheck() {
  const client = await makeClient();
  const customer = await makeCustomer();
  const post = await makePublishedPost(client.id);
  await addToCartDirect(customer.id, post.id);
  await confirmPost(customer, post.id);
  const { check } = await submitCheck(customer, post.id, 'https://example.com/proof');
  return { client, customer, post, check };
}

describe('Checked vs expiry at the deadline', () => {
  it('exactly one of them wins, every time', async () => {
    let checkedWins = 0;
    let expiryWins = 0;

    for (let round = 0; round < 20; round++) {
      const { client, post, check } = await progressingWithPendingCheck();
      await setExpiresIn(post.id, 120);
      // Fire both around the deadline: some rounds slightly before, some slightly after.
      await sleep(120 + ((round % 5) - 2) * 8);

      const [checked, expired] = await Promise.allSettled([markChecked(client, check.id), expireDue()]);
      if (expired.status === 'rejected') throw expired.reason;
      const checkedOk = checked.status === 'fulfilled';
      const expiredInRace = expired.value.includes(post.id);

      // They can never both succeed.
      expect(checkedOk && expiredInRace).toBe(false);

      // Each call evaluates the deadline at its own instant, so both can lose in the same
      // millisecond (expiry just before the deadline, Checked just after). The job's next
      // tick then expires the post, so exactly one outcome wins overall.
      await setExpiresIn(post.id, -1);
      const expiredLater = (await expireDue()).includes(post.id);
      expect([checkedOk, expiredInRace, expiredLater].filter(Boolean)).toHaveLength(1);

      const row = await prisma.post.findUniqueOrThrow({ where: { id: post.id } });
      const sub = await prisma.checkSubmission.findUniqueOrThrow({ where: { id: check.id } });
      if (checkedOk) {
        checkedWins++;
        expect(row.status).toBe('COMPLETED');
        expect(row.holderId).not.toBeNull();
        expect(sub.status).toBe('CHECKED');
      } else {
        expiryWins++;
        expect((checked as PromiseRejectedResult).reason).toBeInstanceOf(HttpError);
        expect((checked as PromiseRejectedResult).reason.code).toBe('TIME_EXPIRED');
        expect(row.status).toBe('PUBLISHED');
        expect(row.holderId).toBeNull();
        expect(sub.status).toBe('EXPIRED');
      }
    }
    expect(checkedWins + expiryWins).toBe(20);
  });

  it('Checked after the deadline returns TIME_EXPIRED and changes nothing', async () => {
    const { client, post, check } = await progressingWithPendingCheck();
    await setExpiresIn(post.id, -1000);
    await expect(markChecked(client, check.id)).rejects.toMatchObject({ status: 409, code: 'TIME_EXPIRED' });
    expect((await prisma.post.findUniqueOrThrow({ where: { id: post.id } })).status).toBe('PROGRESSING');
    expect(await expireDue()).toEqual([post.id]);
  });

  it('expiry does nothing to a post completed before the deadline', async () => {
    const { client, post, check } = await progressingWithPendingCheck();
    await markChecked(client, check.id);
    await setExpiresIn(post.id, -1000);
    expect(await expireDue()).toEqual([]);
    expect((await prisma.post.findUniqueOrThrow({ where: { id: post.id } })).status).toBe('COMPLETED');
  });
});
