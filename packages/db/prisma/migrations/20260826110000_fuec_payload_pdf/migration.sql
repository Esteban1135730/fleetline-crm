-- AlterTable FuecDocument: full extract payload + PDF fields
ALTER TABLE "FuecDocument" ADD COLUMN IF NOT EXISTS "payload" JSONB;
ALTER TABLE "FuecDocument" ADD COLUMN IF NOT EXISTS "contractNumber" TEXT;
ALTER TABLE "FuecDocument" ADD COLUMN IF NOT EXISTS "origin" TEXT;
ALTER TABLE "FuecDocument" ADD COLUMN IF NOT EXISTS "destination" TEXT;
ALTER TABLE "FuecDocument" ADD COLUMN IF NOT EXISTS "tripId" TEXT;

CREATE INDEX IF NOT EXISTS "FuecDocument_tripId_idx" ON "FuecDocument"("tripId");
CREATE INDEX IF NOT EXISTS "FuecDocument_organizationId_contractNumber_idx" ON "FuecDocument"("organizationId", "contractNumber");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'FuecDocument_tripId_fkey'
  ) THEN
    ALTER TABLE "FuecDocument"
      ADD CONSTRAINT "FuecDocument_tripId_fkey"
      FOREIGN KEY ("tripId") REFERENCES "Trip"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
