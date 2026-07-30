-- Enums
DO $$ BEGIN
  CREATE TYPE "QuoteStatus" AS ENUM ('DRAFT','SENT','APPROVED','REJECTED','EXPIRED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "AccountType" AS ENUM ('ASSET','LIABILITY','EQUITY','INCOME','EXPENSE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Driver.organizationId
ALTER TABLE "Driver" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;
UPDATE "Driver" d SET "organizationId" = (SELECT id FROM "Organization" LIMIT 1) WHERE "organizationId" IS NULL;
ALTER TABLE "Driver" ALTER COLUMN "organizationId" SET NOT NULL;

DO $$ BEGIN
  ALTER TABLE "Driver" ADD CONSTRAINT "Driver_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON UPDATE CASCADE ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "Driver" DROP CONSTRAINT IF EXISTS "Driver_document_key";
DO $$ BEGIN
  ALTER TABLE "Driver" ADD CONSTRAINT "Driver_organizationId_document_key" UNIQUE ("organizationId","document");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS "Driver_organizationId_active_idx" ON "Driver"("organizationId","active");

-- Trip.fareAmount
ALTER TABLE "Trip" ADD COLUMN IF NOT EXISTS "fareAmount" DECIMAL(14,2);
ALTER TABLE "Trip" DROP CONSTRAINT IF EXISTS "Trip_code_key";
DO $$ BEGIN
  ALTER TABLE "Trip" ADD CONSTRAINT "Trip_organizationId_code_key" UNIQUE ("organizationId","code");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS "Trip_organizationId_status_idx" ON "Trip"("organizationId","status");
CREATE INDEX IF NOT EXISTS "Trip_organizationId_scheduledAt_idx" ON "Trip"("organizationId","scheduledAt");
CREATE INDEX IF NOT EXISTS "Trip_vehicleId_idx" ON "Trip"("vehicleId");
CREATE INDEX IF NOT EXISTS "Trip_driverId_idx" ON "Trip"("driverId");

-- Invoice.issuedAt
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Invoice" DROP CONSTRAINT IF EXISTS "Invoice_number_key";
DO $$ BEGIN
  ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_organizationId_number_key" UNIQUE ("organizationId","number");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS "Invoice_organizationId_type_status_idx" ON "Invoice"("organizationId","type","status");
CREATE INDEX IF NOT EXISTS "Invoice_organizationId_issuedAt_idx" ON "Invoice"("organizationId","issuedAt");
CREATE INDEX IF NOT EXISTS "Invoice_dueDate_status_idx" ON "Invoice"("dueDate","status");

-- Quote.status -> enum
ALTER TABLE "Quote" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Quote" ALTER COLUMN "status" TYPE "QuoteStatus" USING (
  CASE UPPER("status"::text)
    WHEN 'DRAFT' THEN 'DRAFT'::"QuoteStatus"
    WHEN 'SENT' THEN 'SENT'::"QuoteStatus"
    WHEN 'APPROVED' THEN 'APPROVED'::"QuoteStatus"
    WHEN 'REJECTED' THEN 'REJECTED'::"QuoteStatus"
    WHEN 'EXPIRED' THEN 'EXPIRED'::"QuoteStatus"
    WHEN 'PENDIENTE' THEN 'SENT'::"QuoteStatus"
    WHEN 'APROBADA' THEN 'APPROVED'::"QuoteStatus"
    ELSE 'DRAFT'::"QuoteStatus"
  END
);
ALTER TABLE "Quote" ALTER COLUMN "status" SET DEFAULT 'DRAFT'::"QuoteStatus";
CREATE INDEX IF NOT EXISTS "Quote_customerId_status_idx" ON "Quote"("customerId","status");

-- Account.type -> enum
ALTER TABLE "Account" ALTER COLUMN "type" TYPE "AccountType" USING (
  CASE UPPER("type"::text)
    WHEN 'ASSET' THEN 'ASSET'::"AccountType"
    WHEN 'LIABILITY' THEN 'LIABILITY'::"AccountType"
    WHEN 'EQUITY' THEN 'EQUITY'::"AccountType"
    WHEN 'INCOME' THEN 'INCOME'::"AccountType"
    WHEN 'EXPENSE' THEN 'EXPENSE'::"AccountType"
    WHEN 'ACTIVO' THEN 'ASSET'::"AccountType"
    WHEN 'PASIVO' THEN 'LIABILITY'::"AccountType"
    WHEN 'PATRIMONIO' THEN 'EQUITY'::"AccountType"
    WHEN 'INGRESO' THEN 'INCOME'::"AccountType"
    WHEN 'GASTO' THEN 'EXPENSE'::"AccountType"
    ELSE 'ASSET'::"AccountType"
  END
);
CREATE INDEX IF NOT EXISTS "Account_organizationId_type_idx" ON "Account"("organizationId","type");

-- Ticket org-scoped unique
ALTER TABLE "Ticket" DROP CONSTRAINT IF EXISTS "Ticket_code_key";
DO $$ BEGIN
  ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_organizationId_code_key" UNIQUE ("organizationId","code");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "User_organizationId_role_idx" ON "User"("organizationId","role");
CREATE INDEX IF NOT EXISTS "User_organizationId_active_idx" ON "User"("organizationId","active");
CREATE INDEX IF NOT EXISTS "Customer_organizationId_segment_idx" ON "Customer"("organizationId","segment");
CREATE INDEX IF NOT EXISTS "Vehicle_organizationId_status_idx" ON "Vehicle"("organizationId","status");
CREATE INDEX IF NOT EXISTS "QualityEvent_organizationId_type_idx" ON "QualityEvent"("organizationId","type");
CREATE INDEX IF NOT EXISTS "QualityEvent_organizationId_createdAt_idx" ON "QualityEvent"("organizationId","createdAt");
