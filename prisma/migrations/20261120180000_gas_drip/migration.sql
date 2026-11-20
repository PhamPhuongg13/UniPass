CREATE TABLE "GasDrip" (
  "id" TEXT NOT NULL,
  "wallet" TEXT NOT NULL,
  "txHash" TEXT NOT NULL,
  "amountWei" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GasDrip_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GasDrip_txHash_key" ON "GasDrip"("txHash");
CREATE INDEX "GasDrip_wallet_createdAt_idx" ON "GasDrip"("wallet", "createdAt");
