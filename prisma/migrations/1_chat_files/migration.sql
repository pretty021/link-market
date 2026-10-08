-- Files in chat: a FILE message type and the attachment metadata.
ALTER TYPE "MessageType" ADD VALUE 'FILE';
ALTER TABLE "Message" ADD COLUMN "attachment" JSONB;
