import { Prisma, type AccountKind, type Role, type User } from '@prisma/client';
import { prisma } from '@/lib/db';
import type { Actor, AdminActor } from '@/lib/actor';
import { HttpError, badRequest, conflict, forbidden, notFound } from '@/lib/errors';
import { createSession, hashPassword, revokeAllUserSessions, verifyPassword } from '@/lib/auth';
import { disconnectPrincipal, emit, onlineIds, rooms } from '@/lib/realtime';
import { deleteStoredImage } from '@/lib/storage';
import type { ImageInfo } from '@/lib/validation';

export const ONLINE_WINDOW_MS = 60_000;

// Compared against when the email is unknown, so response timing doesn't reveal which emails exist.
let dummyHash: Promise<string> | null = null;
const getDummyHash = () => (dummyHash ??= hashPassword('not-a-real-password-' + Math.random()));

export function isOnline(id: string, lastSeenAt: Date | null) {
  return onlineIds().has(id) || (!!lastSeenAt && Date.now() - lastSeenAt.getTime() < ONLINE_WINDOW_MS);
}

/** Counts are role-specific: Clients only ever expose s_counts, Customers only b_counts (+ cartLimit). */
export function toUserDTO(u: User) {
  const base = {
    id: u.id,
    role: u.role,
    name: u.name,
    email: u.email,
    image: u.image as ImageInfo | null,
    isBlocked: u.isBlocked,
    deletedAt: u.deletedAt,
    lastSeenAt: u.lastSeenAt,
    online: isOnline(u.id, u.lastSeenAt),
    createdAt: u.createdAt,
  };
  return u.role === 'CLIENT'
    ? { ...base, s_counts: u.s_counts, sellerKinds: u.sellerKinds }
    : { ...base, b_counts: u.b_counts, cartLimit: u.cartLimit };
}
export type UserDTO = ReturnType<typeof toUserDTO>;

// ───────────────────────── Auth ─────────────────────────

export async function login(email: string, password: string, meta: { userAgent?: string | null; ip?: string | null }) {
  const invalid = new HttpError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');

  const admin = await prisma.admin.findUnique({ where: { email } });
  if (admin) {
    if (!(await verifyPassword(password, admin.passwordHash))) throw invalid;
    const s = await createSession({ kind: 'admin', id: admin.id }, meta);
    return { ...s, me: { kind: 'admin' as const, id: admin.id, name: admin.name, email: admin.email } };
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    await verifyPassword(password, await getDummyHash());
    throw invalid;
  }
  if (!(await verifyPassword(password, user.passwordHash))) throw invalid;
  if (user.deletedAt) throw invalid;
  if (user.isBlocked) throw new HttpError(403, 'BLOCKED', 'Your account is blocked. Contact support.');
  const s = await createSession({ kind: 'user', id: user.id }, meta);
  return { ...s, me: { kind: 'user' as const, ...toUserDTO(user) } };
}

async function assertEmailFree(email: string, exceptUserId?: string, exceptAdminId?: string) {
  const [u, a] = await Promise.all([
    prisma.user.findUnique({ where: { email } }),
    prisma.admin.findUnique({ where: { email } }),
  ]);
  if ((u && u.id !== exceptUserId) || (a && a.id !== exceptAdminId)) {
    throw conflict('EMAIL_TAKEN', 'This email is already in use.');
  }
}

function uniqueViolation(e: unknown) {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
    return conflict('EMAIL_TAKEN', 'This email is already in use.');
  }
  return e;
}

export async function registerCustomer(
  data: { name: string; email: string; password: string; image?: ImageInfo | null },
  meta: { userAgent?: string | null; ip?: string | null },
) {
  await assertEmailFree(data.email);
  const user = await prisma.user
    .create({
      data: {
        role: 'CUSTOMER',
        name: data.name,
        email: data.email,
        passwordHash: await hashPassword(data.password),
        image: data.image ?? Prisma.DbNull,
      },
    })
    .catch((e) => {
      throw uniqueViolation(e);
    });
  const s = await createSession({ kind: 'user', id: user.id }, meta);
  emit(rooms.admins, 'presence:update', { stats: await adminStats() });
  return { ...s, me: { kind: 'user' as const, ...toUserDTO(user) } };
}

export async function getMe(actor: Actor) {
  if (actor.kind === 'admin') {
    const a = await prisma.admin.findUniqueOrThrow({ where: { id: actor.id } });
    return { kind: 'admin' as const, id: a.id, name: a.name, email: a.email };
  }
  const u = await prisma.user.findUniqueOrThrow({
    where: { id: actor.id },
    include: { paymentAddresses: { orderBy: { createdAt: 'asc' }, select: { id: true, type: true, address: true } } },
  });
  const dto = { kind: 'user' as const, ...toUserDTO(u) };
  return u.role === 'CLIENT' ? { ...dto, paymentAddresses: u.paymentAddresses } : dto;
}

export async function updateProfile(
  actor: Actor,
  data: { name?: string; email?: string; image?: ImageInfo | null; paymentAddresses?: PaymentInput[] },
) {
  if (data.email) {
    await assertEmailFree(data.email, actor.kind === 'user' ? actor.id : undefined, actor.kind === 'admin' ? actor.id : undefined);
  }
  if (actor.kind === 'admin') {
    await prisma.admin
      .update({ where: { id: actor.id }, data: { name: data.name, email: data.email } })
      .catch((e) => {
        throw uniqueViolation(e);
      });
    return getMe(actor);
  }
  const before = await prisma.user.findUniqueOrThrow({ where: { id: actor.id } });
  await prisma.user
    .update({
      where: { id: actor.id },
      data: {
        name: data.name,
        email: data.email,
        ...(data.image !== undefined ? { image: data.image ?? Prisma.DbNull } : {}),
      },
    })
    .catch((e) => {
      throw uniqueViolation(e);
    });
  await replaceImageCleanup(before.image as ImageInfo | null, data.image);
  if (before.role === 'CLIENT' && data.paymentAddresses) await replacePayments(actor.id, data.paymentAddresses);
  return getMe(actor);
}

async function replaceImageCleanup(old: ImageInfo | null, next: ImageInfo | null | undefined) {
  if (next === undefined || !old?.key || old.key === next?.key) return;
  await deleteStoredImage(old.key).catch(() => undefined);
}

export async function changePassword(actor: Actor, currentPassword: string, newPassword: string) {
  const row =
    actor.kind === 'admin'
      ? await prisma.admin.findUniqueOrThrow({ where: { id: actor.id } })
      : await prisma.user.findUniqueOrThrow({ where: { id: actor.id } });
  if (!(await verifyPassword(currentPassword, row.passwordHash))) {
    throw badRequest('WRONG_PASSWORD', 'Current password is incorrect.');
  }
  const passwordHash = await hashPassword(newPassword);
  if (actor.kind === 'admin') await prisma.admin.update({ where: { id: actor.id }, data: { passwordHash } });
  else await prisma.user.update({ where: { id: actor.id }, data: { passwordHash } });
}

// ───────────────────────── Admin: user management ─────────────────────────

export async function listUsers(role?: Role, q?: string) {
  const users = await prisma.user.findMany({
    where: {
      deletedAt: null,
      ...(role ? { role } : {}),
      ...(q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { email: { contains: q, mode: 'insensitive' } }] } : {}),
    },
    include: { paymentAddresses: { orderBy: { createdAt: 'asc' }, select: { id: true, type: true, address: true } } },
    orderBy: { createdAt: 'desc' },
  });
  return users.map((u) =>
    u.role === 'CLIENT' ? { ...toUserDTO(u), paymentAddresses: u.paymentAddresses } : toUserDTO(u),
  );
}

type PaymentInput = { type: string; address: string };

type AdminUserInput = {
  name?: string;
  email?: string;
  password?: string;
  image?: ImageInfo | null;
  s_counts?: number;
  b_counts?: number;
  cartLimit?: number;
  paymentAddresses?: PaymentInput[];
  sellerKinds?: AccountKind[];
};

async function replacePayments(clientId: string, addresses: PaymentInput[]) {
  await prisma.$transaction([
    prisma.paymentAddress.deleteMany({ where: { clientId } }),
    ...(addresses.length
      ? [prisma.paymentAddress.createMany({ data: addresses.map((a) => ({ clientId, type: a.type, address: a.address })) })]
      : []),
  ]);
}

/** Drop fields that don't belong to the role (b_counts/cartLimit are Customer-only, s_counts Client-only). */
function roleFields(role: Role, d: AdminUserInput) {
  return role === 'CLIENT'
    ? { s_counts: d.s_counts, ...(d.sellerKinds ? { sellerKinds: [...new Set(d.sellerKinds)] } : {}) }
    : { b_counts: d.b_counts, cartLimit: d.cartLimit };
}

export async function createUser(admin: AdminActor, d: AdminUserInput & { role: Role; name: string; email: string; password: string }) {
  await assertEmailFree(d.email);
  const user = await prisma.user
    .create({
      data: {
        role: d.role,
        name: d.name,
        email: d.email,
        passwordHash: await hashPassword(d.password),
        image: d.image ?? Prisma.DbNull,
        createdById: admin.id,
        ...roleFields(d.role, d),
      },
    })
    .catch((e) => {
      throw uniqueViolation(e);
    });
  if (d.role === 'CLIENT' && d.paymentAddresses) await replacePayments(user.id, d.paymentAddresses);
  emit(rooms.admins, 'presence:update', { stats: await adminStats() });
  return toUserDTO(user);
}

export async function updateUser(userId: string, d: AdminUserInput) {
  const before = await prisma.user.findUnique({ where: { id: userId } });
  if (!before || before.deletedAt) throw notFound('User');
  if (d.email) await assertEmailFree(d.email, userId);
  const user = await prisma.user
    .update({
      where: { id: userId },
      data: {
        name: d.name,
        email: d.email,
        ...(d.password ? { passwordHash: await hashPassword(d.password) } : {}),
        ...(d.image !== undefined ? { image: d.image ?? Prisma.DbNull } : {}),
        ...roleFields(before.role, d),
      },
    })
    .catch((e) => {
      throw uniqueViolation(e);
    });
  await replaceImageCleanup(before.image as ImageInfo | null, d.image);
  if (before.role === 'CLIENT' && d.paymentAddresses) await replacePayments(user.id, d.paymentAddresses);
  const dto = toUserDTO(user);
  emit(rooms.user(userId), 'me:updated', { me: { kind: 'user', ...dto } });
  return dto;
}

export async function setBlocked(userId: string, blocked: boolean) {
  const res = await prisma.user.updateMany({ where: { id: userId, deletedAt: null }, data: { isBlocked: blocked } });
  if (res.count === 0) throw notFound('User');
  if (blocked) {
    await revokeAllUserSessions(userId);
    await disconnectPrincipal(rooms.user(userId));
  }
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  emit(rooms.admins, 'presence:update', { stats: await adminStats() });
  return toUserDTO(user);
}

/** Soft delete (Clients only, per the role table): history survives, login and sessions stop. */
export async function softDeleteUser(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.deletedAt) throw notFound('User');
  if (user.role !== 'CLIENT') throw forbidden('Only Client accounts can be deleted. Block Customers instead.');
  await prisma.user.update({ where: { id: userId }, data: { deletedAt: new Date() } });
  await revokeAllUserSessions(userId);
  await disconnectPrincipal(rooms.user(userId));
  emit(rooms.admins, 'presence:update', { stats: await adminStats() });
}

// ───────────────────────── Presence / stats ─────────────────────────

async function onlineCount(role: Role) {
  const live = [...onlineIds()];
  return prisma.user.count({
    where: {
      role,
      deletedAt: null,
      isBlocked: false,
      OR: [{ id: { in: live } }, { lastSeenAt: { gte: new Date(Date.now() - ONLINE_WINDOW_MS) } }],
    },
  });
}

export async function adminStats() {
  const active = (role: Role) => prisma.user.count({ where: { role, deletedAt: null } });
  const [clientsOnline, clientsTotal, customersOnline, customersTotal, requested, progressing] = await Promise.all([
    onlineCount('CLIENT'),
    active('CLIENT'),
    onlineCount('CUSTOMER'),
    active('CUSTOMER'),
    prisma.post.count({ where: { status: 'REQUESTED' } }),
    prisma.post.count({ where: { status: 'PROGRESSING' } }),
  ]);
  return { clientsOnline, clientsTotal, customersOnline, customersTotal, requested, progressing };
}

export async function onlineCustomers() {
  const live = [...onlineIds()];
  const users = await prisma.user.findMany({
    where: {
      role: 'CUSTOMER',
      deletedAt: null,
      isBlocked: false,
      OR: [{ id: { in: live } }, { lastSeenAt: { gte: new Date(Date.now() - ONLINE_WINDOW_MS) } }],
    },
    orderBy: { name: 'asc' },
  });
  // Clients see who is online, not Customer-specific numbers.
  return users.map((u) => ({ id: u.id, name: u.name, image: u.image as ImageInfo | null, online: true }));
}

/** Customers this Client has deal chats with, newest chat first. */
export async function customersByChat(clientId: string) {
  const convs = await prisma.conversation.findMany({
    where: { type: 'DEAL', participants: { some: { userId: clientId } } },
    include: {
      post: { select: { id: true, title: true, status: true } },
      participants: { include: { user: { select: { id: true, name: true, role: true, image: true, lastSeenAt: true } } } },
    },
    orderBy: [{ lastMessageAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
  });
  if (convs.length === 0) return [];
  const rows = await prisma.$queryRaw<{ conversationId: string; n: bigint }[]>`
    SELECT cp."conversationId", COUNT(m.id) AS n
    FROM "ConversationParticipant" cp
    JOIN "Message" m ON m."conversationId" = cp."conversationId"
      AND (cp."lastReadAt" IS NULL OR m."createdAt" > cp."lastReadAt")
      AND (m."senderUserId" IS NULL OR m."senderUserId" <> ${clientId})
    WHERE cp."userId" = ${clientId} AND cp."conversationId" = ANY(${convs.map((c) => c.id)})
    GROUP BY cp."conversationId"`;
  const unread = new Map(rows.map((r) => [r.conversationId, Number(r.n)]));
  return convs.map((c) => {
    const cust = c.participants.find((p) => p.user?.role === 'CUSTOMER')?.user;
    return {
      conversationId: c.id,
      lastMessageAt: c.lastMessageAt,
      unread: unread.get(c.id) ?? 0,
      post: c.post,
      customer: cust
        ? { id: cust.id, name: cust.name, image: cust.image as ImageInfo | null, online: isOnline(cust.id, cust.lastSeenAt) }
        : null,
    };
  });
}
