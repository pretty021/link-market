-- Payment method the Customer chose when sending checking info (copied from the Client's address).
ALTER TABLE "CheckSubmission" ADD COLUMN "paymentType" TEXT;
ALTER TABLE "CheckSubmission" ADD COLUMN "paymentAddress" TEXT;
