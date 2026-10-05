-- Columnas y valores que el tablero de gerencia consulta y que no estaban en migraciones anteriores.

ALTER TYPE "WorkOrderStatus" ADD VALUE IF NOT EXISTS 'DIAGNOSIS';
ALTER TYPE "WorkOrderStatus" ADD VALUE IF NOT EXISTS 'PENDING_APPROVAL';
ALTER TYPE "WorkOrderStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';

ALTER TYPE "InvoiceStatus" ADD VALUE IF NOT EXISTS 'PENDING_MATCH';
ALTER TYPE "InvoiceStatus" ADD VALUE IF NOT EXISTS 'CLEARED_FOR_PAYMENT';
ALTER TYPE "InvoiceStatus" ADD VALUE IF NOT EXISTS 'CAUSED';
ALTER TYPE "InvoiceStatus" ADD VALUE IF NOT EXISTS 'RETURNED_TO_VENDOR';

ALTER TYPE "PurchaseStatus" ADD VALUE IF NOT EXISTS 'DRAFT';
ALTER TYPE "PurchaseStatus" ADD VALUE IF NOT EXISTS 'PENDING_APPROVAL';
ALTER TYPE "PurchaseStatus" ADD VALUE IF NOT EXISTS 'IN_TRANSIT';
ALTER TYPE "PurchaseStatus" ADD VALUE IF NOT EXISTS 'PARTIALLY_RECEIVED';
ALTER TYPE "PurchaseStatus" ADD VALUE IF NOT EXISTS 'MATCHED';
ALTER TYPE "PurchaseStatus" ADD VALUE IF NOT EXISTS 'MATCH_FAILED';

ALTER TYPE "QuoteStatus" ADD VALUE IF NOT EXISTS 'WON';

ALTER TYPE "VehicleStatus" ADD VALUE IF NOT EXISTS 'COMPLIANCE_BLOCKED';

ALTER TABLE "Driver" ADD COLUMN IF NOT EXISTS "dispatchBlocked" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "WorkOrder" ADD COLUMN IF NOT EXISTS "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "WorkOrder" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;

UPDATE "WorkOrder" AS w
SET "organizationId" = v."organizationId"
FROM "Vehicle" AS v
WHERE w."vehicleId" = v."id"
  AND w."organizationId" IS NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'Trip' AND column_name = 'scheduledAt'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'Trip' AND column_name = 'departAt'
  ) THEN
    ALTER TABLE "Trip" RENAME COLUMN "scheduledAt" TO "departAt";
  ELSIF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'Trip' AND column_name = 'departAt'
  ) THEN
    ALTER TABLE "Trip" ADD COLUMN "departAt" TIMESTAMP(3);
    UPDATE "Trip" SET "departAt" = COALESCE("startedAt", "createdAt") WHERE "departAt" IS NULL;
    ALTER TABLE "Trip" ALTER COLUMN "departAt" SET NOT NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'Employee' AND column_name = 'driverId'
  ) THEN
    ALTER TABLE "Employee" ADD COLUMN "driverId" TEXT;
    CREATE UNIQUE INDEX "Employee_driverId_key" ON "Employee"("driverId");
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "GerenciaWarRoomSession" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "openedById" TEXT NOT NULL,
    "directors" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "bottleneck" TEXT,
    "chatChannel" TEXT,
    "videoLink" TEXT,
    "closedAt" TIMESTAMP(3),
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GerenciaWarRoomSession_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "GerenciaWarRoomSession_organizationId_code_key"
  ON "GerenciaWarRoomSession"("organizationId", "code");

DO $$ BEGIN
  ALTER TABLE "GerenciaWarRoomSession"
    ADD CONSTRAINT "GerenciaWarRoomSession_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
