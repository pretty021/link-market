-- Sellers can sell more than one account type. Existing rows stay LinkedIn.
CREATE TYPE "AccountKind" AS ENUM ('LINKEDIN', 'GV', 'GMAIL', 'WHATSAPP', 'TELEGRAM');

ALTER TABLE "User" ADD COLUMN "sellerKinds" "AccountKind"[] NOT NULL DEFAULT ARRAY['LINKEDIN']::"AccountKind"[];

ALTER TABLE "Post" ADD COLUMN "kind" "AccountKind" NOT NULL DEFAULT 'LINKEDIN';

CREATE INDEX "Post_kind_status_idx" ON "Post"("kind", "status");
