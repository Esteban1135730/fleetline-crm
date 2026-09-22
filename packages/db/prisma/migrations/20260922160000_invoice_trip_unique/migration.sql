-- Idempotencia FinOps: una prefactura RECEIVABLE por viaje
DROP INDEX IF EXISTS "Invoice_tripId_idx";

-- Limpia duplicados dejando la más antigua
DELETE FROM "Invoice" a
USING "Invoice" b
WHERE a."tripId" IS NOT NULL
  AND a."tripId" = b."tripId"
  AND a."createdAt" > b."createdAt";

CREATE UNIQUE INDEX "Invoice_tripId_key" ON "Invoice"("tripId");
