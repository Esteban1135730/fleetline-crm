DO $$ BEGIN
  CREATE TYPE "SarlaftEvidenceSource" AS ENUM (
    'POLICIA',
    'PROCURADURIA',
    'REGISTRADURIA',
    'ANTECEDENTES',
    'LISTAS',
    'OTHER'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "SarlaftEvidence" (
  "id" TEXT NOT NULL,
  "checkId" TEXT NOT NULL,
  "source" "SarlaftEvidenceSource" NOT NULL,
  "title" TEXT NOT NULL,
  "fileRef" TEXT,
  "originalName" TEXT,
  "mimeType" TEXT,
  "byteSize" INTEGER,
  "contentHash" TEXT,
  "uploadedById" TEXT,
  "organizationId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "SarlaftEvidence_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "SarlaftEvidence_checkId_createdAt_idx"
  ON "SarlaftEvidence"("checkId", "createdAt");

CREATE INDEX IF NOT EXISTS "SarlaftEvidence_organizationId_source_idx"
  ON "SarlaftEvidence"("organizationId", "source");

DO $$ BEGIN
  ALTER TABLE "SarlaftEvidence"
    ADD CONSTRAINT "SarlaftEvidence_checkId_fkey"
    FOREIGN KEY ("checkId") REFERENCES "SarlaftCheck"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "SarlaftEvidence"
    ADD CONSTRAINT "SarlaftEvidence_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "SarlaftEvidence"
    ADD CONSTRAINT "SarlaftEvidence_uploadedById_fkey"
    FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
