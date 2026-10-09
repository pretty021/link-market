import { Prisma, type Post, type PostStatus } from '@prisma/client';
import { DB_NOW, prisma, type Tx } from '@/lib/db';
import type { AdminActor, UserActor } from '@/lib/actor';
import { badRequest, conflict, notFound } from '@/lib/errors';
import { rooms, viewerCount } from '@/lib/realtime';
import { deleteStoredImage } from '@/lib/storage';
import type { ImageInfo } from '@/lib/validation';
import { Outbox } from '../outbox';
import { notify } from './notifications';
import { addMessage } from './messages';

export const PROGRESS_MINUTES = 5;

export const postInclude = {
  client: { select: { id: true, name: true } },
  holder: { select: { id: true, name: true } },
} as const;

export type PostRow = Post & {
  client: { id: string; name: string };
  holder: { id: string; name: string } | null;
};

/**
 * staff=true (Admin, the post's Client): includes holder identity.
 * staff=false (Customers): holder is only exposed as an id so a Customer can tell "is it me?".
 */
export function toPostDTO(p: PostRow, opts: { staff: boolean }) {
  return {
    id: p.id,
    title: p.title,
    name: p.name,
    visible: p.visible,
    status: p.status,
    image: p.image as ImageInfo | null,
    connects: p.connects,
    price: p.price,
    approval: p.approval,
    viewCount: p.viewCount,
    viewers: viewerCount(p.id),
    clientId: p.clientId,
    clientName: p.client.name,
    holderId: p.holderId,
    holderName: opts.staff ? (p.holder?.name ?? null) : null,
    progressingAt: p.progressingAt,
    progressingExpiresAt: p.progressingExpiresAt,
    progressingPausedAt: p.progressingPausedAt,
    completedAt: p.completedAt,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}
export type PostDTO = ReturnType<typeof toPostDTO>;

/** Database clock (not transaction start time), used as serverNow everywhere. */
export async function dbNow(client: Tx | typeof prisma = prisma): Promise<Date> {
  const [row] = await client.$queryRaw<{ now: Date }[]>`SELECT clock_timestamp() AS now`;
  return row.now;
}

const customerVisible = (s: PostStatus) => s === 'PUBLISHED' || s === 'PROGRESSING';

export function pushPost(out: Outbox, post: PostRow, serverNow: Date, event = 'post:updated') {
  if (post.approval) {
    out.push([rooms.customers, rooms.post(post.id)], event, { post: toPostDTO(post, { staff: false }), serverNow });
  }
  out.push([rooms.user(post.clientId), rooms.admins], event, { post: toPostDTO(post, { staff: true }), serverNow });
}

async function loadPost(client: Tx | typeof prisma, id: string): Promise<PostRow> {
  return client.post.findUniqueOrThrow({ where: { id }, include: postInclude });
}

// ───────────────────────── Expiry (section 3.1) ─────────────────────────

/**
 * Returns PROGRESSING posts whose countdown ran out to PUBLISHED.
 * The UPDATE is conditional on status + DB clock, so it races safely with "Checked"
 * (which uses the opposite time condition) and with other expiry runs.
 */
export async function expireDue(postIds?: string[]): Promise<string[]> {
  if (postIds && postIds.length === 0) return [];
  // Cheap indexed probe so ordinary reads don't open a transaction when nothing is due.
  const due = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM "Post"
    WHERE status = 'PROGRESSING' AND "progressingPausedAt" IS NULL AND "progressingExpiresAt" <= ${DB_NOW}
    ${postIds ? Prisma.sql`AND id = ANY(${postIds})` : Prisma.empty}
    LIMIT 1`;
  if (due.length === 0) return [];

  const out = new Outbox();
  const expiredIds = await prisma.$transaction(
    async (tx) => {
      const rows = await tx.$queryRaw<
        { id: string; clientId: string; title: string; formerHolderId: string }[]
      >`
        WITH due AS (
          SELECT id, "holderId" FROM "Post"
          WHERE status = 'PROGRESSING' AND "progressingPausedAt" IS NULL AND "progressingExpiresAt" <= ${DB_NOW}
          ${postIds ? Prisma.sql`AND id = ANY(${postIds})` : Prisma.empty}
          ORDER BY id
          FOR UPDATE
        )
        UPDATE "Post" p
        SET status = 'PUBLISHED', "holderId" = NULL,
            "progressingAt" = NULL, "progressingExpiresAt" = NULL, "progressingPausedAt" = NULL, "updatedAt" = ${DB_NOW}
        FROM due
        WHERE p.id = due.id AND p.status = 'PROGRESSING' AND p."progressingPausedAt" IS NULL AND p."progressingExpiresAt" <= ${DB_NOW}
        RETURNING p.id, p."clientId", p.title, due."holderId" AS "formerHolderId"`;

      if (rows.length === 0) return [];
      const serverNow = await dbNow(tx);

      for (const row of rows) {
        await tx.checkSubmission.updateMany({
          where: { postId: row.id, status: 'PENDING' },
          data: { status: 'EXPIRED', reviewedAt: serverNow },
        });

        const conv = await tx.conversation.findUnique({ where: { pairKey: `${row.id}:${row.formerHolderId}` } });
        if (conv) {
          await addMessage(tx, out, {
            conversationId: conv.id,
            type: 'SYSTEM',
            body: 'Time expired. This post is available again.',
          });
        }

        const n = {
          type: 'POST_EXPIRED' as const,
          title: 'Time expired',
          body: `"${row.title}" is available again.`,
          postId: row.id,
          conversationId: conv?.id ?? null,
        };
        await notify(tx, out, { userId: row.formerHolderId }, n);
        await notify(tx, out, { userId: row.clientId }, n);

        const post = await loadPost(tx, row.id);
        pushPost(out, post, serverNow, 'post:updated');
        out.push(
          [rooms.user(row.formerHolderId), rooms.user(row.clientId), rooms.admins, conv ? rooms.conversation(conv.id) : null],
          'post:expired',
          {
            post: toPostDTO(post, { staff: false }),
            formerHolderId: row.formerHolderId,
            conversationId: conv?.id ?? null,
            serverNow,
          },
        );
      }
      return rows.map((r) => r.id);
    },
    { timeout: 30_000, maxWait: 10_000 },
  );
  out.flush();
  return expiredIds;
}

// ───────────────────────── Confirm (section 3.2) ─────────────────────────

export async function confirmPost(customer: UserActor, postId: string) {
  await expireDue([postId]);

  // Single compare-and-set. Concurrent UPDATEs on the same row serialize on the row lock;
  // after the winner commits, the others re-check the WHERE, see PROGRESSING and match 0 rows.
  const [rows] = await prisma.$transaction([
    prisma.$queryRaw<{ id: string; progressingExpiresAt: Date; serverNow: Date }[]>`
      UPDATE "Post"
      SET status = 'PROGRESSING', "holderId" = ${customer.id},
          "progressingAt" = ${DB_NOW}, "progressingExpiresAt" = ${DB_NOW} + interval '5 minutes', "progressingPausedAt" = NULL,
          "updatedAt" = ${DB_NOW}
      WHERE id = ${postId}
        AND status = 'PUBLISHED'
        AND approval = true
        AND visible = true
        AND "holderId" IS NULL
        AND EXISTS (SELECT 1 FROM "CartItem" WHERE "customerId" = ${customer.id} AND "postId" = ${postId})
      RETURNING id, "progressingExpiresAt", clock_timestamp() AS "serverNow"`,
  ]);

  if (rows.length === 0) {
    const post = await prisma.post.findUnique({ where: { id: postId }, include: postInclude });
    const serverNow = await dbNow();
    if (!post || !post.approval || !post.visible) throw notFound('Post');
    const data = { post: toPostDTO(post, { staff: false }), serverNow };
    if (post.status === 'PUBLISHED') {
      const inCart = await prisma.cartItem.findUnique({
        where: { customerId_postId: { customerId: customer.id, postId } },
      });
      if (!inCart) throw conflict('NOT_IN_CART', 'Add this post to your cart first.', data);
    }
    if (post.status === 'COMPLETED') throw conflict('POST_COMPLETED', 'This post is already completed.', data);
    throw conflict('ALREADY_PROGRESSING', 'Another customer confirmed this post first.', data);
  }

  const { progressingExpiresAt, serverNow } = rows[0];
  const post = await loadPost(prisma, postId);
  const out = new Outbox();
  pushPost(out, post, serverNow);
  out.flush();

  return {
    progressingExpiresAt,
    serverNow,
    client: { name: post.client.name },
    price: post.price,
    post: toPostDTO(post, { staff: false }),
  };
}

// ───────────────────────── Cancel a hold ─────────────────────────

/**
 * The progressing Customer gives the post up before the countdown ends: it returns to PUBLISHED
 * (approved, every Customer can confirm again), exactly as on expiry. Pending checking info is closed
 * as EXPIRED (the schema has no cancelled state), the deal chat gets a system message, and the Client
 * is notified. Conditional on status + holder, so it races safely with "Checked" and with expiry.
 */
export async function cancelHold(customer: UserActor, postId: string) {
  const out = new Outbox();
  const post = await prisma.$transaction(
    async (tx) => {
      const rows = await tx.$queryRaw<{ id: string; clientId: string; title: string }[]>`
        UPDATE "Post"
        SET status = 'PUBLISHED', "holderId" = NULL,
            "progressingAt" = NULL, "progressingExpiresAt" = NULL, "progressingPausedAt" = NULL, "updatedAt" = ${DB_NOW}
        WHERE id = ${postId} AND status = 'PROGRESSING' AND "holderId" = ${customer.id}
        RETURNING id, "clientId", title`;

      if (rows.length === 0) {
        const current = await tx.post.findUnique({ where: { id: postId }, include: postInclude });
        if (!current || !current.approval) throw notFound('Post');
        const data = { post: toPostDTO(current, { staff: false }), serverNow: await dbNow(tx) };
        if (current.status === 'COMPLETED') throw conflict('POST_COMPLETED', 'This post is already completed.', data);
        throw conflict('NOT_HOLDING', 'You are not holding this post.', data);
      }

      const row = rows[0];
      const serverNow = await dbNow(tx);
      await tx.checkSubmission.updateMany({
        where: { postId: row.id, status: 'PENDING' },
        data: { status: 'EXPIRED', reviewedAt: serverNow },
      });

      const conv = await tx.conversation.findUnique({ where: { pairKey: `${row.id}:${customer.id}` } });
      if (conv) {
        await addMessage(tx, out, {
          conversationId: conv.id,
          type: 'SYSTEM',
          body: 'The customer cancelled the hold. This post is available again.',
        });
      }

      await notify(tx, out, { userId: row.clientId }, {
        type: 'POST_EXPIRED',
        title: 'Hold cancelled',
        body: `The customer released "${row.title}". It is available again.`,
        postId: row.id,
        conversationId: conv?.id ?? null,
      });

      const updated = await loadPost(tx, row.id);
      pushPost(out, updated, serverNow, 'post:updated');
      // Same event as expiry, so every screen (cart, feed, client dashboard, admin, deal chat) refreshes.
      out.push(
        [rooms.user(customer.id), rooms.user(row.clientId), rooms.admins, conv ? rooms.conversation(conv.id) : null],
        'post:expired',
        { post: toPostDTO(updated, { staff: false }), formerHolderId: customer.id, conversationId: conv?.id ?? null, reason: 'cancelled', serverNow },
      );
      return updated;
    },
    { timeout: 30_000, maxWait: 10_000 },
  );
  out.flush();
  return { post: toPostDTO(post, { staff: false }) };
}

// ───────────────────────── Admin: accept / edit ─────────────────────────

export async function acceptPost(admin: AdminActor, postId: string, note?: string) {
  const out = new Outbox();
  const result = await prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      UPDATE "Post" SET approval = true, status = 'PUBLISHED', "updatedAt" = ${DB_NOW}
      WHERE id = ${postId} AND status = 'REQUESTED' AND price IS NOT NULL
      RETURNING id`;
    if (rows.length === 0) {
      const p = await tx.post.findUnique({ where: { id: postId } });
      if (!p) throw notFound('Post');
      if (p.status !== 'REQUESTED') throw conflict('NOT_REQUESTED', 'This post was already accepted.');
      throw badRequest('PRICE_REQUIRED', 'Set and save a price before accepting.');
    }
    await tx.postApproval.create({ data: { postId, adminId: admin.id, note: note || null } });
    const post = await loadPost(tx, postId);
    await notify(tx, out, { userId: post.clientId }, {
      type: 'POST_ACCEPTED',
      title: 'Post accepted',
      body: `"${post.name || post.title}" is now live for customers.`,
      postId,
    });
    const serverNow = await dbNow(tx);
    pushPost(out, post, serverNow, 'post:published');
    return { post: toPostDTO(post, { staff: true }), serverNow };
  });
  out.flush();
  return result;
}

export async function updatePostByAdmin(
  postId: string,
  data: { image?: ImageInfo | null; connects?: number; price?: number; name?: string | null },
) {
  const before = await prisma.post.findUnique({ where: { id: postId } });
  if (!before) throw notFound('Post');
  const post = await prisma.post.update({
    where: { id: postId },
    data: {
      ...(data.image !== undefined ? { image: data.image ?? Prisma.DbNull } : {}),
      ...(data.connects !== undefined ? { connects: data.connects } : {}),
      ...(data.price !== undefined ? { price: data.price } : {}),
      ...(data.name !== undefined ? { name: data.name } : {}),
    },
    include: postInclude,
  });
  const oldImage = before.image as ImageInfo | null;
  if (data.image !== undefined && oldImage?.key && oldImage.key !== data.image?.key) {
    await deleteStoredImage(oldImage.key).catch(() => undefined);
  }
  const serverNow = await dbNow();
  const out = new Outbox();
  pushPost(out, post, serverNow);
  out.flush();
  return { post: toPostDTO(post, { staff: true }), serverNow };
}

/**
 * Show or hide an accepted post for Customers (its Client always sees it). A post that is
 * in progress can't be hidden mid-deal. Hiding takes it out of every cart.
 */
export async function setPostVisibility(postId: string, visible: boolean) {
  const out = new Outbox();
  const result = await prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      UPDATE "Post" SET visible = ${visible}, "updatedAt" = ${DB_NOW}
      WHERE id = ${postId} AND approval = true AND status <> 'PROGRESSING'
      RETURNING id`;
    if (rows.length === 0) {
      const p = await tx.post.findUnique({ where: { id: postId } });
      if (!p) throw notFound('Post');
      if (!p.approval) throw conflict('NOT_ACCEPTED', 'Accept the post first.');
      throw conflict('IN_PROGRESS', 'A buyer is holding this post. Try again when the deal ends.');
    }
    const carted = visible
      ? []
      : await tx.cartItem.findMany({ where: { postId }, select: { customerId: true } });
    if (!visible) await tx.cartItem.deleteMany({ where: { postId } });
    const post = await loadPost(tx, postId);
    const serverNow = await dbNow(tx);
    pushPost(out, post, serverNow);
    return { post, serverNow, carted: carted.map((c) => c.customerId) };
  });
  out.flush();
  for (const customerId of result.carted) {
    const out2 = new Outbox();
    out2.push(rooms.user(customerId), 'cart:updated', await cartSnapshot(customerId));
    out2.flush();
  }
  return { post: toPostDTO(result.post, { staff: true }), serverNow: result.serverNow };
}

/** Delete a post that is still a request (never shown to Customers). */
export async function deleteRequestedPost(postId: string) {
  const rows = await prisma.$queryRaw<{ id: string; clientId: string; image: unknown }[]>`
    DELETE FROM "Post" WHERE id = ${postId} AND status = 'REQUESTED'
    RETURNING id, "clientId", image`;
  if (rows.length === 0) {
    const p = await prisma.post.findUnique({ where: { id: postId } });
    if (!p) throw notFound('Post');
    throw conflict('NOT_REQUESTED', 'Only post requests can be deleted.');
  }
  const image = rows[0].image as ImageInfo | null;
  if (image?.key) await deleteStoredImage(image.key).catch(() => undefined);
  const out = new Outbox();
  out.push([rooms.admins, rooms.user(rows[0].clientId)], 'post:deleted', { postId });
  out.flush();
  return { ok: true };
}

export async function listAdminPosts(status?: PostStatus) {
  await expireDue();
  const posts = await prisma.post.findMany({
    where: status ? { status } : {},
    include: postInclude,
    orderBy: { createdAt: 'desc' },
  });
  return { posts: posts.map((p) => toPostDTO(p, { staff: true })), serverNow: await dbNow() };
}

// ───────────────────────── Client ─────────────────────────

export async function createClientPosts(client: UserActor, titles: string[]) {
  const posts = await prisma.$transaction(
    titles.map((title) => prisma.post.create({ data: { clientId: client.id, title }, include: postInclude })),
  );
  const serverNow = await dbNow();
  const dtos = posts.map((p) => toPostDTO(p, { staff: true }));
  const out = new Outbox();
  out.push([rooms.admins, rooms.user(client.id)], 'post:requested', { posts: dtos, serverNow });
  out.flush();
  return { posts: dtos, serverNow };
}

export async function listClientPosts(client: UserActor) {
  await expireDue();
  const posts = await prisma.post.findMany({
    where: { clientId: client.id },
    include: postInclude,
    orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
  });
  return { posts: posts.map((p) => toPostDTO(p, { staff: true })), serverNow: await dbNow() };
}

// ───────────────────────── Customer feed / post ─────────────────────────

export async function listFeed(customer: UserActor) {
  await expireDue();
  const [posts, cart] = await Promise.all([
    prisma.post.findMany({
      // Live listings for everyone, plus the accounts this Customer completed (they stay the holder).
      where: {
        approval: true,
        OR: [{ status: { in: ['PUBLISHED', 'PROGRESSING'] }, visible: true }, { status: 'COMPLETED', holderId: customer.id }],
      },
      include: postInclude,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.cartItem.findMany({ where: { customerId: customer.id }, select: { postId: true } }),
  ]);
  return {
    posts: posts.map((p) => toPostDTO(p, { staff: false })),
    cartPostIds: cart.map((c) => c.postId),
    serverNow: await dbNow(),
  };
}

export async function getPostForCustomer(customer: UserActor, postId: string) {
  await expireDue([postId]);
  const post = await prisma.post.findUnique({ where: { id: postId }, include: postInclude });
  if (!post) throw notFound('Post');
  const visible = (post.approval && post.visible && customerVisible(post.status)) || post.holderId === customer.id;
  if (!visible) throw notFound('Post');

  await prisma.$executeRaw`
    WITH ins AS (
      INSERT INTO "PostView" ("postId", "customerId", "firstViewedAt", "lastViewedAt")
      VALUES (${postId}, ${customer.id}, ${DB_NOW}, ${DB_NOW})
      ON CONFLICT ("postId", "customerId") DO UPDATE SET "lastViewedAt" = ${DB_NOW}
      RETURNING (xmax = 0) AS inserted
    )
    UPDATE "Post" SET "viewCount" = "viewCount" + 1
    WHERE id = ${postId} AND EXISTS (SELECT 1 FROM ins WHERE inserted)`;

  const [fresh, inCart] = await Promise.all([
    loadPost(prisma, postId),
    prisma.cartItem.findUnique({ where: { customerId_postId: { customerId: customer.id, postId } } }),
  ]);
  return { post: toPostDTO(fresh, { staff: false }), inCart: !!inCart, serverNow: await dbNow() };
}

// ───────────────────────── Cart ─────────────────────────

export async function cartSnapshot(customerId: string) {
  const [items, user] = await Promise.all([
    prisma.cartItem.findMany({ where: { customerId }, select: { postId: true } }),
    prisma.user.findUniqueOrThrow({ where: { id: customerId }, select: { cartLimit: true } }),
  ]);
  return { postIds: items.map((i) => i.postId), count: items.length, cartLimit: user.cartLimit };
}

export async function addToCart(customer: UserActor, postId: string) {
  const inserted = await prisma.$transaction(async (tx) => {
    // Serialize this customer's cart writes so two parallel adds can't both pass the limit check.
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${customer.id} FOR UPDATE`;
    const rows = await tx.$queryRaw<{ postId: string }[]>`
      INSERT INTO "CartItem" ("customerId", "postId", "addedAt")
      SELECT ${customer.id}, ${postId}, ${DB_NOW}
      WHERE (SELECT COUNT(*) FROM "CartItem" WHERE "customerId" = ${customer.id})
              < (SELECT "cartLimit" FROM "User" WHERE id = ${customer.id})
        AND EXISTS (SELECT 1 FROM "Post" WHERE id = ${postId} AND approval = true AND visible = true AND status = 'PUBLISHED')
      ON CONFLICT ("customerId", "postId") DO NOTHING
      RETURNING "postId"`;
    if (rows.length > 0) return true;

    const existing = await tx.cartItem.findUnique({
      where: { customerId_postId: { customerId: customer.id, postId } },
    });
    if (existing) return false;
    const post = await tx.post.findUnique({ where: { id: postId } });
    if (!post || !post.approval || !post.visible) throw notFound('Post');
    if (post.status === 'COMPLETED') throw conflict('POST_COMPLETED', 'This post is already completed.');
    if (post.status !== 'PUBLISHED') {
      throw conflict('POST_UNAVAILABLE', 'Only published posts can be added to the cart.');
    }
    const user = await tx.user.findUniqueOrThrow({ where: { id: customer.id } });
    throw conflict(
      'CART_LIMIT_REACHED',
      `Your cart is full. You can hold up to ${user.cartLimit} post${user.cartLimit === 1 ? '' : 's'}.`,
      { cartLimit: user.cartLimit },
    );
  });
  const cart = await cartSnapshot(customer.id);
  const out = new Outbox();
  if (inserted) out.push(rooms.user(customer.id), 'cart:updated', cart);
  out.flush();
  return cart;
}

export async function removeFromCart(customer: UserActor, postId: string) {
  const removed = await prisma.$executeRaw`
    DELETE FROM "CartItem"
    WHERE "customerId" = ${customer.id} AND "postId" = ${postId}
      AND NOT EXISTS (
        SELECT 1 FROM "Post" WHERE id = ${postId} AND status = 'PROGRESSING' AND "holderId" = ${customer.id}
      )`;
  if (removed === 0) {
    const holding = await prisma.post.findFirst({
      where: { id: postId, status: 'PROGRESSING', holderId: customer.id },
    });
    if (holding) throw conflict('HOLDING', 'You are progressing this post. Finish or let the countdown end first.');
  }
  const cart = await cartSnapshot(customer.id);
  const out = new Outbox();
  out.push(rooms.user(customer.id), 'cart:updated', cart);
  out.flush();
  return cart;
}

export async function getCart(customer: UserActor) {
  const before = await prisma.cartItem.findMany({ where: { customerId: customer.id }, select: { postId: true } });
  await expireDue(before.map((i) => i.postId));

  const rows = await prisma.cartItem.findMany({
    where: { customerId: customer.id },
    include: { post: { include: postInclude } },
    orderBy: { addedAt: 'desc' },
  });
  const heldIds = rows.filter((r) => r.post.holderId === customer.id).map((r) => r.postId);
  const [checks, convs, user] = await Promise.all([
    prisma.checkSubmission.findMany({
      where: { postId: { in: heldIds }, customerId: customer.id },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.conversation.findMany({
      where: { pairKey: { in: rows.map((r) => `${r.postId}:${customer.id}`) } },
      select: { id: true, postId: true },
    }),
    prisma.user.findUniqueOrThrow({ where: { id: customer.id }, select: { cartLimit: true } }),
  ]);

  const items = rows.map((r) => {
    const held = r.post.holderId === customer.id;
    // Only submissions from the current progressing window count (older ones belong to an expired hold).
    const latest = held
      ? checks.find((c) => c.postId === r.postId && r.post.progressingAt && c.createdAt >= r.post.progressingAt)
      : undefined;
    return {
      addedAt: r.addedAt,
      post: toPostDTO(r.post, { staff: false }),
      heldByMe: held,
      latestCheckStatus: latest?.status ?? null,
      conversationId: convs.find((c) => c.postId === r.postId)?.id ?? null,
    };
  });
  return { items, count: items.length, cartLimit: user.cartLimit, serverNow: await dbNow() };
}
