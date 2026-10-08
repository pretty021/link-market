# Decisions and assumptions

Everything below was not fully specified by the build prompt; the simplest reasonable option was chosen.

## Data and time

1. **Schema unchanged.** `prisma/schema.prisma` is exactly the spec. The CHECK constraints are appended to the first migration (`prisma/migrations/0_init/migration.sql`).
2. **UTC in raw SQL.** Prisma stores `DateTime` as UTC in `timestamp without time zone` columns. Plain `now()` would be converted to the database session's local time zone, which would shift every countdown on a non-UTC server. All raw SQL therefore uses `(now() AT TIME ZONE 'UTC')` (`DB_NOW` in `src/lib/db.ts`). `serverNow` uses `clock_timestamp()` (a real instant, not the transaction start).
3. **Expiry statement.** The spec's expiry `UPDATE` is used with one addition: a `FOR UPDATE` CTE that also returns the former `holderId` (the `RETURNING` clause only sees the new, NULL value). The conditions are unchanged.
4. **Confirm runs expiry first** for that post, so a post whose deadline passed a moment ago can be confirmed immediately rather than after the next worker tick.
5. **`expireDue` probes first.** A cheap indexed `SELECT ... LIMIT 1` runs before opening a transaction, so ordinary page loads don't hold connections when nothing is due.
6. **"Exactly one wins" for Checked vs expiry** means they can never both succeed. Each call evaluates the deadline at its own instant, so in the same millisecond both can be refused (expiry ran just before the deadline, Checked just after). The worker's next tick then expires the post. The race test models this.
7. **Prices** are rounded to 2 decimals when saved; display always shows 2 decimals.

## Posts and cart

8. **Accept requires a saved price.** A post can't be published with a null price. Image and connects are optional.
9. **Only PUBLISHED posts can be added to the cart** (spec 3.3). Adding a post already in the cart is a no-op, not an error.
10. **Cart limit under concurrency.** The cart insert locks the Customer's `User` row first, so parallel "add" requests can't exceed `cartLimit`.
11. **A holder can't remove the post they are progressing** from their cart (it would hide the "Submit checking info" entry point). They can remove it after it completes or expires.
12. **Completed posts stay in carts** (not specified). They show as Completed with a link to the deal chat and can be removed.
13. **409 codes.** Confirm returns `ALREADY_PROGRESSING` when someone else holds it, and `NOT_IN_CART` / `POST_COMPLETED` for those specific cases, always with the current post state.
14. **One pending submission at a time.** A Customer can't submit new checking info while one is PENDING (`CHECK_PENDING`); after Not checked they can resubmit.
15. **"Viewing now"** counts distinct Customers who have a post's detail dialog open (a socket in `post:{id}`), not everyone who scrolled past the card. Counts are broadcast to `post:{id}`, `customers` and `admins` so feed cards update.
16. **Customer-facing post data** includes `holderId` (so a Customer can tell "is it me?") but never the holder's name; Admins and the post's Client also get `holderName`.

## Chat and notifications

17. **Deal chat is created on the first checking-info submission**, not at Confirm (spec 4.6 step 4).
18. **The Client can always send text in a deal chat**; only the Customer is restricted until the latest submission is CHECKED.
19. **System message on Not checked** ("Not checked. Please submit new checking info...") is added so the chat shows what happened.
20. **NEW_MESSAGE notifications are not stacked:** a recipient gets at most one unread NEW_MESSAGE per conversation. "Viewing the chat" means having a socket in that conversation's room.
21. **Support chat.** Clients and Customers open "Chat with Admin" from the user menu (Client dashboard also has a button). It goes to the first Admin. Admins start chats from the user tables.
22. **Admin reading** a chat they don't participate in never writes `lastReadAt` and never joins as a participant. Admins only send in ADMIN_CLIENT / ADMIN_CUSTOMER chats they participate in.
23. **CheckSubmission visibility in messages.** CHECK_REQUEST messages always show the submitted URL (the message body) to chat participants, but the structured check (status, ids) is included only for the post's current holder, its Client and Admins. After expiry the former holder still reads the chat, but no longer sees check status.

## Auth, users, profile

24. **Admin profile** can change name, email and password. The `Admin` model has no image column, so Admins have no avatar.
25. **Delete is Clients only** (per the role table). Customers can be blocked. Deleted Clients keep their email reserved.
26. **Emails are unique across Admins and Users** (checked in code, since they're separate tables). Emails are lower-cased.
27. **Passwords:** minimum 8 characters, bcrypt cost 12. Unknown-email logins still run a bcrypt compare so timing doesn't reveal which emails exist.
28. **Sessions** last 30 days. Unblocking a user does not restore old sessions.
29. **Rate limits** (in memory, per process): Confirm 5 per 10 s per user, login 10/min per IP+email, register 10/hour per IP, uploads 30/min (5/min anonymous), messages 20 per 10 s, check submissions 10/min.
30. **Anonymous image upload** is allowed only so the registration form can include a photo; it is rate-limited by IP.
31. **"Online"** = an open socket or `lastSeenAt` within 60 seconds. Blocked and deleted users are never counted.

## Uploads

32. **Type is detected from file bytes** (magic numbers), not the browser's MIME type. Width and height are parsed from PNG/JPEG/WEBP headers without native dependencies.
33. **Local storage** writes to `./uploads` and is served by the custom server at `/uploads/*` (Next.js only serves `public/` files that existed at build time). Replaced images are deleted by `key`.

## UI

34. **Design** follows the provided mockups: deep navy background, mint primary actions, purple secondary actions, rounded glowing cards, the "Fresh accounts. Real conversations." hero, the 5-step purchase strip, and the feature and benefit tiles. The mockup images themselves aren't used as assets (they contain presentation labels and stock photos); posts without an image get a generated gradient cover.
35. **Confirm lives on the Cart page** (spec 4.6). Feed cards offer Cart / Remove cart, and the progressing Customer sees their countdown with a link to the cart.
36. **Browser notifications** are requested the first time the user opens the bell, and shown only when the tab is in the background.
