-- Additive idempotency constraints and short-lived hashed check-in credentials.
-- The existing database was inspected read-only before this migration:
-- no duplicate chainEventId/chainTx groups and no CheckInAudit rows existed.
CREATE UNIQUE INDEX "EventMetadata_chainEventId_key" ON "EventMetadata"("chainEventId");
CREATE UNIQUE INDEX "EventMetadata_chainTx_key" ON "EventMetadata"("chainTx");
CREATE UNIQUE INDEX "CheckInAudit_eventId_tokenId_key" ON "CheckInAudit"("eventId", "tokenId");

CREATE TABLE "TicketCheckInCredential" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "chainEventId" TEXT NOT NULL,
    "tokenId" TEXT NOT NULL,
    "ownerWallet" TEXT NOT NULL,
    "ownerSessionId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "consumedBy" TEXT,
    "chainTx" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketCheckInCredential_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TicketCheckInCredential_tokenHash_key" ON "TicketCheckInCredential"("tokenHash");
CREATE INDEX "TicketCheckInCredential_ownerWallet_createdAt_idx" ON "TicketCheckInCredential"("ownerWallet", "createdAt");
CREATE INDEX "TicketCheckInCredential_eventId_tokenId_expiresAt_idx" ON "TicketCheckInCredential"("eventId", "tokenId", "expiresAt");
CREATE INDEX "TicketCheckInCredential_expiresAt_consumedAt_idx" ON "TicketCheckInCredential"("expiresAt", "consumedAt");
