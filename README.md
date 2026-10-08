# LinkMarket

A three-role post marketplace (Admin / Client / Customer) with real-time updates, a fair
5-minute "hold" on each post, check review, deal chat and notifications.

**Stack:** Next.js 14 (App Router) + TypeScript, PostgreSQL + Prisma 5, Socket.IO on a custom
Node server, Tailwind CSS + shadcn-style components (Radix), Zod, bcrypt sessions.

The core guarantee: when many Customers click **Confirm** on the same post at the same instant,
exactly one gets it. Every post status change is a single conditional `UPDATE ... WHERE status = ...`
(compare-and-set) checked by its returned row count, backed by database CHECK constraints.
See [How concurrency is handled](#how-concurrency-is-handled).

---

## Quick start (development)

Requirements: Node.js 20+ and PostgreSQL 14+.

```bash
cp .env.example .env            # then edit DATABASE_URL, ADMIN_EMAIL, ADMIN_PASSWORD
npm install
npx prisma generate             # npm 11 may skip Prisma's install script; run it explicitly
npx prisma migrate deploy       # creates tables + CHECK constraints
npm run db:seed                 # first Admin from env + sample data
npm run dev                     # http://localhost:3000 (Next.js + Socket.IO + expiry worker)
```

Sample accounts created by the seed (development only):

| Role | Email | Password |
|---|---|---|
| Admin | `ADMIN_EMAIL` from `.env` | `ADMIN_PASSWORD` from `.env` |
| Client | `client@example.com` (pt96), `client2@example.com` | `password123` |
| Customer | `customer@example.com` (cart limit 2), `customer2@example.com`, `customer3@example.com` | `password123` |

The database must use UTF-8 encoding (`CREATE DATABASE linkmarket ENCODING 'UTF8'`).

## Tests

Tests run against a **real PostgreSQL database** (row locks and the database clock are what is
being tested, so nothing is mocked). Use a disposable database: every table is truncated.

```bash
# once
DATABASE_URL="postgresql://.../linkmarket_test" npx prisma migrate deploy
# every run
TEST_DATABASE_URL="postgresql://.../linkmarket_test" npm test
```

| File | What it proves |
|---|---|
| `tests/confirm-concurrency.test.ts` | 50 Customers confirm one post at once through the real route handler: exactly 1 × 200, 49 × 409 `ALREADY_PROGRESSING`, exactly one `holderId`; countdown is 5:00 on the DB clock; the CHECK constraint rejects a holder-less PROGRESSING row |
| `tests/checked-vs-expiry.test.ts` | Checked and the expiry job raced at the deadline over 20 rounds: never both, exactly one outcome sticks |
| `tests/lifecycle.test.ts` | Expiry → PUBLISHED, `holderId` null, `approval` true, pending checks EXPIRED, cart kept, another Customer can confirm; Checked stops the countdown, returns the deal `conversationId`, notifies the Customer, and removes the post from every cart (a completed post can't be carted again); Not checked doesn't restart the countdown; Client gets `CHECK_SUBMITTED`; Customer can text only after Checked |
| `tests/auth.test.ts` | Login (Admin table first), only the token's SHA-256 hash is stored, httpOnly/SameSite cookie, blocking revokes every session, soft-deleted users can't log in, password change needs the current password |
| `tests/cart-and-counts.test.ts` | `cartLimit` (default 1, parallel adds can't exceed it), counts by role (`s_counts` for Clients, `b_counts` + `cartLimit` for Customers) |
| `tests/visibility.test.ts` | CheckSubmission 403 for anyone but holder / Client / Admin; chat 403 for non-participants; Admin reads every chat, deal chats read-only, no unread side-effects |

## Folder structure

```
prisma/
  schema.prisma              # the spec schema, unchanged
  migrations/0_init/         # generated SQL + all CHECK constraints
  seed.ts                    # first Admin from env, sample data in development
src/
  server/
    index.ts                 # custom server: Next.js + Socket.IO + 5s expiry worker + /uploads
    outbox.ts                # collects socket events, emitted only after the transaction commits
    services/                # ALL business logic (routes and tests call the same functions)
      posts.ts               # confirm (CAS), accept, expiry, cart, feed, views
      checks.ts              # submit checking info, Checked, Not checked, visibility rules
      chat.ts                # conversations, messages, unread counts, admin history
      users.ts               # login, register, profile, admin user management, presence
      notifications.ts
      messages.ts
  app/
    api/**/route.ts          # thin REST handlers: auth + Zod + call a service
    (auth)/login, register
    (app)/admin/*            # dashboard, posts, clients, customers, all chats
    (app)/client             # Client dashboard
    (app)/(customer)/feed, cart
    (app)/chat, profile      # shared by all roles
    page.tsx                 # landing page
  components/                # app shell, chat, notification bell, post bits, ui primitives
  lib/
    auth.ts                  # bcrypt, session tokens (SHA-256 hashed), session lookup
    http.ts                  # route wrapper, role guards, cookie helpers
    validation.ts            # Zod schemas for every API input
    realtime.ts              # shared Socket.IO handle, rooms, presence, live viewers
    storage.ts               # local disk / S3 image storage, magic-byte type sniffing
    client/                  # browser-side API client, server clock + countdown hook, types
tests/                       # Vitest suites against a real database
```

## How concurrency is handled

- **Confirm** is one statement: `UPDATE "Post" SET status='PROGRESSING', "holderId"=$me, ... WHERE id=$post
  AND status='PUBLISHED' AND approval AND "holderId" IS NULL AND EXISTS(cart item) RETURNING ...`.
  PostgreSQL serializes concurrent updates on the row; after the winner commits, the rest re-check
  the `WHERE`, match 0 rows and get HTTP 409.
- **Checked** requires `status='PROGRESSING' AND "progressingExpiresAt" > now`; **expiry** requires
  `status='PROGRESSING' AND "progressingExpiresAt" <= now`. Opposite conditions on one row: only one
  can ever succeed.
- **Not checked** and every CheckSubmission change are conditional on `status='PENDING'`, so double
  clicks are no-ops.
- **Side effects** (submissions, messages, notifications) happen in the same transaction and only
  for the winner. Socket events go through an outbox and are emitted after commit.
- **Database safety net:** `post_holder_check` and `post_progressing_check` reject inconsistent rows.
- **Deal chats** are created with `upsert` on the unique `pairKey`.
- **Time** always comes from the database clock. Every response and socket event carries
  `serverNow`; the browser computes the countdown from `progressingExpiresAt - serverNow`.
- **Expiry** runs on every read that shows a post (feed, post, cart, chat lists) and in a background
  worker every 5 seconds.

## Realtime

Sockets authenticate with the session cookie. Rooms: `user:{id}`, `admin:{id}`, `admins`,
`clients`, `customers`, `post:{id}`, `conversation:{id}` (joining a conversation room is
permission-checked). Events: `presence:update`, `post:requested`, `post:published`, `post:updated`,
`post:expired`, `post:viewers`, `cart:updated`, `check:updated`, `check:checked`, `message:new`,
`conversation:updated`, `notification:new`, `session:revoked`, `me:updated`. Clients send
`heartbeat` every 30s and re-fetch their data on reconnect.

## Deploy

```bash
npm ci && npx prisma generate
npx prisma migrate deploy
npm run db:seed                  # creates the Admin; sample data is skipped when NODE_ENV=production
npm run build
npm start                        # serves on $PORT
```

- Run behind HTTPS (the session cookie is `Secure` in production). Your proxy must forward
  WebSocket upgrades for `/socket.io` (e.g. nginx `proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";`).
- Use S3-compatible storage in production: set `STORAGE_DRIVER=s3` and the `S3_*` variables
  (see `.env.example`). Local disk (`./uploads`) is for development or single-server setups with a
  persistent volume.
- Run **one** app instance. Presence, live viewer counts and rate limits are kept in memory. To scale
  out, add the Socket.IO Redis adapter and a shared rate-limit store (correctness of post status does
  not depend on this; it is enforced by the database).
- `/uploads` is served by the custom server, not Next.js, so files uploaded after the build are served.
