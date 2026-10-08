-- "Client Checking": the hold countdown is paused while checking info waits for the Client.
ALTER TABLE "Post" ADD COLUMN "progressingPausedAt" TIMESTAMP(3);
