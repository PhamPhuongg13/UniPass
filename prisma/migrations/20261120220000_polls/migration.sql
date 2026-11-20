CREATE TABLE "Poll" (
  "id" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "options" TEXT[] NOT NULL,
  "eligibility" TEXT NOT NULL DEFAULT 'OPEN',
  "allowedSchoolDomains" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "closesAt" TIMESTAMP(3) NOT NULL,
  "chainPollId" TEXT,
  "chainTx" TEXT,
  "createdByWallet" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Poll_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "PollVoteMirror" (
  "id" TEXT NOT NULL,
  "pollId" TEXT NOT NULL,
  "option" INTEGER NOT NULL,
  "voterNullifier" TEXT NOT NULL,
  "chainTx" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PollVoteMirror_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Poll_slug_key" ON "Poll"("slug");
CREATE UNIQUE INDEX "Poll_chainPollId_key" ON "Poll"("chainPollId");
CREATE UNIQUE INDEX "PollVoteMirror_chainTx_key" ON "PollVoteMirror"("chainTx");
CREATE UNIQUE INDEX "PollVoteMirror_pollId_voterNullifier_key" ON "PollVoteMirror"("pollId", "voterNullifier");
ALTER TABLE "PollVoteMirror" ADD CONSTRAINT "PollVoteMirror_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "Poll"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
