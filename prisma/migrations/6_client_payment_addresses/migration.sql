-- Admins can store several payment addresses on a Client (type + address).
CREATE TABLE "PaymentAddress" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentAddress_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PaymentAddress_clientId_idx" ON "PaymentAddress"("clientId");

ALTER TABLE "PaymentAddress" ADD CONSTRAINT "PaymentAddress_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
