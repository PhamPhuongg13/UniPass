ALTER TABLE "EventMetadata"
  ADD COLUMN "eligibility" TEXT NOT NULL DEFAULT 'OPEN',
  ADD COLUMN "allowedSchoolDomains" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "EventMetadata"
  ADD CONSTRAINT "EventMetadata_eligibility_check"
  CHECK ("eligibility" IN ('OPEN', 'STUDENT', 'SCHOOLS'));
