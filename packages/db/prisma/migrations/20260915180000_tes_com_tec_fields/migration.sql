-- TES-02: confirmación de cobros CxC
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "receivedByName" TEXT;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "collectionConfirmedAt" TIMESTAMP(3);
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "collectionConfirmedById" TEXT;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "bankRef" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Invoice_collectionConfirmedById_fkey'
  ) THEN
    ALTER TABLE "Invoice"
      ADD CONSTRAINT "Invoice_collectionConfirmedById_fkey"
      FOREIGN KEY ("collectionConfirmedById") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- TEC-03: área responsable y cierre en tickets TI
ALTER TABLE "SystemTicket" ADD COLUMN IF NOT EXISTS "area" TEXT;
ALTER TABLE "SystemTicket" ADD COLUMN IF NOT EXISTS "closedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "SystemTicket_organizationId_area_status_idx"
  ON "SystemTicket"("organizationId", "area", "status");
