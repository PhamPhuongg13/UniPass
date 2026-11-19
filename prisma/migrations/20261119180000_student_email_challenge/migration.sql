CREATE TABLE "StudentEmailChallenge" (
    "id" TEXT NOT NULL,
    "nonceHash" TEXT NOT NULL,
    "wallet" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "origin" TEXT NOT NULL,
    "chainId" INTEGER NOT NULL,
    "purpose" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StudentEmailChallenge_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StudentEmailChallenge_nonceHash_key" ON "StudentEmailChallenge"("nonceHash");
CREATE INDEX "StudentEmailChallenge_wallet_createdAt_idx" ON "StudentEmailChallenge"("wallet", "createdAt");
CREATE INDEX "StudentEmailChallenge_sessionId_expiresAt_idx" ON "StudentEmailChallenge"("sessionId", "expiresAt");
CREATE INDEX "StudentEmailChallenge_expiresAt_consumedAt_idx" ON "StudentEmailChallenge"("expiresAt", "consumedAt");
