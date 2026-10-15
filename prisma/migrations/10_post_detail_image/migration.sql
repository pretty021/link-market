-- Optional detail image (e.g. a profile screenshot) set by the Admin; Customers open it full-size.
ALTER TABLE "Post" ADD COLUMN "detailImage" JSONB;
