-- Post display name (set by the Admin) and visibility to Customers (enable / disable).
ALTER TABLE "Post" ADD COLUMN "name" TEXT;
ALTER TABLE "Post" ADD COLUMN "visible" BOOLEAN NOT NULL DEFAULT true;
