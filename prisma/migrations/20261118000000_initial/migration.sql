-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "OrganizerProfile" (
    "id" TEXT NOT NULL,
    "wallet" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "bio" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrganizerProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventMetadata" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "organizerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "coverUrl" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Ho_Chi_Minh',
    "location" TEXT NOT NULL,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "metadataCapacity" INTEGER,
    "registrationDeadline" TIMESTAMP(3),
    "visibility" TEXT NOT NULL DEFAULT 'PUBLIC',
    "chainEventId" TEXT,
    "syncStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventMetadata_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegistrationMirror" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "wallet" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "chainTx" TEXT,
    "blockNumber" BIGINT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RegistrationMirror_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketMirror" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "tokenId" TEXT NOT NULL,
    "ownerWallet" TEXT NOT NULL,
    "mintedAt" TIMESTAMP(3),
    "checkedInAt" TIMESTAMP(3),
    "chainTx" TEXT,

    CONSTRAINT "TicketMirror_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CheckInAudit" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "tokenId" TEXT NOT NULL,
    "staffWallet" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "chainTx" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CheckInAudit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthNonce" (
    "id" TEXT NOT NULL,
    "wallet" TEXT NOT NULL,
    "nonceHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthNonce_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthSession" (
    "id" TEXT NOT NULL,
    "wallet" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OrganizerProfile_wallet_key" ON "OrganizerProfile"("wallet");

-- CreateIndex
CREATE UNIQUE INDEX "EventMetadata_slug_key" ON "EventMetadata"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "RegistrationMirror_eventId_wallet_key" ON "RegistrationMirror"("eventId", "wallet");

-- CreateIndex
CREATE UNIQUE INDEX "TicketMirror_eventId_tokenId_key" ON "TicketMirror"("eventId", "tokenId");

-- CreateIndex
CREATE UNIQUE INDEX "AuthNonce_nonceHash_key" ON "AuthNonce"("nonceHash");

-- CreateIndex
CREATE INDEX "AuthNonce_wallet_expiresAt_idx" ON "AuthNonce"("wallet", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "AuthSession_tokenHash_key" ON "AuthSession"("tokenHash");

-- CreateIndex
CREATE INDEX "AuthSession_wallet_expiresAt_idx" ON "AuthSession"("wallet", "expiresAt");

-- AddForeignKey
ALTER TABLE "EventMetadata" ADD CONSTRAINT "EventMetadata_organizerId_fkey" FOREIGN KEY ("organizerId") REFERENCES "OrganizerProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegistrationMirror" ADD CONSTRAINT "RegistrationMirror_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "EventMetadata"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketMirror" ADD CONSTRAINT "TicketMirror_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "EventMetadata"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

