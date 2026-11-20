CREATE TABLE "ZkEmailAttestation" (
  "id" TEXT NOT NULL,
  "wallet" TEXT NOT NULL,
  "domain" TEXT NOT NULL,
  "fromDomainHash" TEXT NOT NULL,
  "publicKeyHash" TEXT NOT NULL,
  "proofId" TEXT NOT NULL,
  "txHash" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ZkEmailAttestation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ZkEmailAttestation_wallet_key" ON "ZkEmailAttestation"("wallet");
CREATE UNIQUE INDEX "ZkEmailAttestation_txHash_key" ON "ZkEmailAttestation"("txHash");
