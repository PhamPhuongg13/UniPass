CREATE TABLE "TicketChainLog" (
    "id" TEXT NOT NULL,
    "chainId" INTEGER NOT NULL,
    "contractAddress" TEXT NOT NULL,
    "txHash" TEXT NOT NULL,
    "logIndex" INTEGER NOT NULL,
    "blockNumber" BIGINT NOT NULL,
    "transactionIndex" INTEGER NOT NULL,
    "blockHash" TEXT NOT NULL,
    "tokenId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "studentWallet" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TicketChainLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ChainSyncCheckpoint" (
    "id" TEXT NOT NULL,
    "chainId" INTEGER NOT NULL,
    "contractAddress" TEXT NOT NULL,
    "eventName" TEXT NOT NULL,
    "nextBlock" BIGINT NOT NULL,
    "caughtUp" BOOLEAN NOT NULL DEFAULT false,
    "lastSyncedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ChainSyncCheckpoint_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TicketChainLog_chainId_contractAddress_txHash_logIndex_key"
ON "TicketChainLog"("chainId", "contractAddress", "txHash", "logIndex");
CREATE INDEX "TicketChainLog_chainId_contractAddress_studentWallet_blockNumber_idx"
ON "TicketChainLog"("chainId", "contractAddress", "studentWallet", "blockNumber");
CREATE INDEX "TicketChainLog_chainId_contractAddress_tokenId_idx"
ON "TicketChainLog"("chainId", "contractAddress", "tokenId");
CREATE UNIQUE INDEX "ChainSyncCheckpoint_chainId_contractAddress_eventName_key"
ON "ChainSyncCheckpoint"("chainId", "contractAddress", "eventName");
CREATE INDEX "TicketMirror_ownerWallet_mintedAt_idx" ON "TicketMirror"("ownerWallet", "mintedAt");
