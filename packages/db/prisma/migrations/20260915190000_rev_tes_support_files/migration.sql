-- REV-01: soporte en hallazgos forenses
ALTER TABLE "ForensicFinding" ADD COLUMN IF NOT EXISTS "supportFileRef" TEXT;
ALTER TABLE "ForensicFinding" ADD COLUMN IF NOT EXISTS "supportOriginalName" TEXT;
ALTER TABLE "ForensicFinding" ADD COLUMN IF NOT EXISTS "supportMimeType" TEXT;

-- TES-03: comprobante en facturas CxC/CxP
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "supportFileRef" TEXT;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "supportOriginalName" TEXT;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "supportMimeType" TEXT;
