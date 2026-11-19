-- Additive state for a separately deployed V2 manager. Existing V1 records remain intact.
ALTER TABLE "EventMetadata" ADD COLUMN "fujiV2EventId" TEXT;
CREATE UNIQUE INDEX "EventMetadata_fujiV2EventId_key" ON "EventMetadata"("fujiV2EventId");

CREATE TABLE "StudentEligibility" (
  "wallet" TEXT NOT NULL,
  "chainId" INTEGER NOT NULL,
  "senderDomain" TEXT NOT NULL,
  "blueprintId" TEXT NOT NULL,
  "policyVersion" TEXT NOT NULL,
  "sourceChallengeHash" TEXT NOT NULL,
  "verifiedAt" TIMESTAMP(3) NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StudentEligibility_pkey" PRIMARY KEY ("wallet")
);
CREATE UNIQUE INDEX "StudentEligibility_sourceChallengeHash_key" ON "StudentEligibility"("sourceChallengeHash");
CREATE INDEX "StudentEligibility_expiresAt_revokedAt_idx" ON "StudentEligibility"("expiresAt", "revokedAt");

CREATE TABLE "RegistrationAuthorizationAudit" (
  "id" TEXT NOT NULL,
  "nonceHash" TEXT NOT NULL,
  "wallet" TEXT NOT NULL,
  "metadataEventId" TEXT NOT NULL,
  "chainEventId" TEXT NOT NULL,
  "chainId" INTEGER NOT NULL,
  "verifyingContract" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RegistrationAuthorizationAudit_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "RegistrationAuthorizationAudit_nonceHash_key" ON "RegistrationAuthorizationAudit"("nonceHash");
CREATE INDEX "RegistrationAuthorizationAudit_wallet_createdAt_idx" ON "RegistrationAuthorizationAudit"("wallet", "createdAt");
CREATE INDEX "RegistrationAuthorizationAudit_metadataEventId_createdAt_idx" ON "RegistrationAuthorizationAudit"("metadataEventId", "createdAt");
CREATE INDEX "RegistrationAuthorizationAudit_expiresAt_idx" ON "RegistrationAuthorizationAudit"("expiresAt");

CREATE TABLE "EventStaffMirror" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "wallet" TEXT NOT NULL,
  "authorized" BOOLEAN NOT NULL,
  "chainTx" TEXT NOT NULL,
  "changedBy" TEXT NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EventStaffMirror_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "EventStaffMirror_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "EventMetadata"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "EventStaffMirror_eventId_wallet_key" ON "EventStaffMirror"("eventId", "wallet");
CREATE INDEX "EventStaffMirror_eventId_authorized_idx" ON "EventStaffMirror"("eventId", "authorized");
