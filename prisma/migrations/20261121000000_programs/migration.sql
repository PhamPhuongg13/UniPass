CREATE TYPE "ProgramKind" AS ENUM ('GIVEAWAY', 'SCHOLARSHIP', 'DISCOUNT', 'ECOSYSTEM');
CREATE TYPE "ScholarshipStatus" AS ENUM ('SUBMITTED', 'AWARDED');
CREATE TABLE "Program" (
  "id" TEXT NOT NULL, "slug" TEXT NOT NULL, "kind" "ProgramKind" NOT NULL,
  "title" TEXT NOT NULL, "description" TEXT NOT NULL, "sponsor" TEXT NOT NULL,
  "eligibility" TEXT NOT NULL, "allowedSchoolDomains" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "cap" INTEGER NOT NULL, "closesAt" TIMESTAMP(3) NOT NULL,
  "amountPerClaim" TEXT NOT NULL DEFAULT '0', "chainProgramId" TEXT,
  "chainTx" TEXT, "createdByWallet" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "extra" JSONB NOT NULL DEFAULT '{}', CONSTRAINT "Program_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Program_slug_key" ON "Program"("slug");
CREATE UNIQUE INDEX "Program_chainProgramId_key" ON "Program"("chainProgramId");
CREATE TABLE "ProgramStamp" (
  "id" TEXT NOT NULL, "programId" TEXT NOT NULL, "nullifier" TEXT NOT NULL,
  "chainTx" TEXT NOT NULL, "recipientWallet" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProgramStamp_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ProgramStamp_chainTx_key" ON "ProgramStamp"("chainTx");
CREATE UNIQUE INDEX "ProgramStamp_programId_nullifier_key" ON "ProgramStamp"("programId", "nullifier");
ALTER TABLE "ProgramStamp" ADD CONSTRAINT "ProgramStamp_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE TABLE "ScholarshipApplication" (
  "id" TEXT NOT NULL, "programId" TEXT NOT NULL, "nullifier" TEXT NOT NULL,
  "answer" TEXT NOT NULL, "school" TEXT NOT NULL, "status" "ScholarshipStatus" NOT NULL DEFAULT 'SUBMITTED',
  "awardTx" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ScholarshipApplication_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ScholarshipApplication_answer_length" CHECK (char_length("answer") <= 1000)
);
CREATE UNIQUE INDEX "ScholarshipApplication_programId_nullifier_key" ON "ScholarshipApplication"("programId", "nullifier");
ALTER TABLE "ScholarshipApplication" ADD CONSTRAINT "ScholarshipApplication_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE TABLE "DiscountCode" (
  "id" TEXT NOT NULL, "programId" TEXT NOT NULL, "nullifier" TEXT NOT NULL,
  "codeHash" TEXT NOT NULL, "redeemedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DiscountCode_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DiscountCode_codeHash_key" ON "DiscountCode"("codeHash");
CREATE UNIQUE INDEX "DiscountCode_programId_nullifier_key" ON "DiscountCode"("programId", "nullifier");
ALTER TABLE "DiscountCode" ADD CONSTRAINT "DiscountCode_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
