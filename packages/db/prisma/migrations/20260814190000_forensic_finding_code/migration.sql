-- Restaura el código forense RF-00N (columna presente en la migración original
-- y luego perdida por db push). Idempotente para entornos ya sincronizados.
ALTER TABLE "ForensicFinding" ADD COLUMN IF NOT EXISTS "code" TEXT;

UPDATE "ForensicFinding" AS f
SET "code" = 'RF-' || LPAD(sub.n::text, 3, '0')
FROM (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY "organizationId" ORDER BY "createdAt", id) AS n
  FROM "ForensicFinding"
) AS sub
WHERE f.id = sub.id
  AND (f."code" IS NULL OR f."code" = '');

ALTER TABLE "ForensicFinding" ALTER COLUMN "code" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "ForensicFinding_organizationId_code_key"
  ON "ForensicFinding"("organizationId", "code");
