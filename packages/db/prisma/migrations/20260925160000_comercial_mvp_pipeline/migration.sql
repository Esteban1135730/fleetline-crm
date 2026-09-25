-- Ficha comercial del cliente y pipeline de cotización (MVP comercial).

ALTER TABLE "Customer" ADD COLUMN "contactName" TEXT;
ALTER TABLE "Customer" ADD COLUMN "creditKind" TEXT;
ALTER TABLE "Customer" ADD COLUMN "serviceFrequency" TEXT;
ALTER TABLE "Customer" ADD COLUMN "servicesPerMonth" TEXT;
ALTER TABLE "Customer" ADD COLUMN "preferredVehicle" TEXT;
ALTER TABLE "Customer" ADD COLUMN "logisticsOwner" TEXT;
ALTER TABLE "Customer" ADD COLUMN "commercialNote" TEXT;
ALTER TABLE "Customer" ADD COLUMN "branch" TEXT;

ALTER TABLE "Quote" ADD COLUMN "pipelineStage" TEXT NOT NULL DEFAULT 'BANT';
ALTER TABLE "Quote" ADD COLUMN "nextAction" TEXT;
ALTER TABLE "Quote" ADD COLUMN "followUpAt" TIMESTAMP(3);
ALTER TABLE "Quote" ADD COLUMN "lossReason" TEXT;
ALTER TABLE "Quote" ADD COLUMN "fitScore" INTEGER;
ALTER TABLE "Quote" ADD COLUMN "urgencyScore" INTEGER;
ALTER TABLE "Quote" ADD COLUMN "budgetScore" INTEGER;
ALTER TABLE "Quote" ADD COLUMN "docStatus" TEXT;
ALTER TABLE "Quote" ADD COLUMN "wonAt" TIMESTAMP(3);

UPDATE "Quote" SET "pipelineStage" = CASE "status"
  WHEN 'SENT' THEN 'COTIZADA'
  WHEN 'APPROVED' THEN 'NEGOCIACION'
  WHEN 'WON' THEN 'GANADO'
  WHEN 'REJECTED' THEN 'PERDIDO'
  WHEN 'EXPIRED' THEN 'PERDIDO'
  ELSE 'BANT'
END;

UPDATE "Quote" SET "wonAt" = "updatedAt" WHERE "status" = 'WON' AND "wonAt" IS NULL;

CREATE INDEX "Quote_pipelineStage_followUpAt_idx" ON "Quote"("pipelineStage", "followUpAt");
