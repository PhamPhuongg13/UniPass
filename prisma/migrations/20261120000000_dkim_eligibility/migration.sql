ALTER TABLE "StudentEligibility" ADD COLUMN "emailNullifier" TEXT, ADD COLUMN "verificationMode" TEXT NOT NULL DEFAULT 'zk', ADD COLUMN "rebindCount" INTEGER NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX "StudentEligibility_emailNullifier_key" ON "StudentEligibility"("emailNullifier");
ALTER TABLE "RegistrationAuthorizationAudit" ADD COLUMN "studentNullifier" TEXT;
