-- Enlace de un solo uso para el alta de usuarios (módulo Usuarios)
CREATE TABLE IF NOT EXISTS "TiOnboardingLink" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "targetRole" "RoleCode" NOT NULL DEFAULT 'CONDUCTOR',
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TiOnboardingLink_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "TiOnboardingLink_organizationId_email_idx" ON "TiOnboardingLink"("organizationId", "email");
CREATE INDEX IF NOT EXISTS "TiOnboardingLink_tokenHash_idx" ON "TiOnboardingLink"("tokenHash");
CREATE INDEX IF NOT EXISTS "TiOnboardingLink_expiresAt_idx" ON "TiOnboardingLink"("expiresAt");

DO $$ BEGIN
  ALTER TABLE "TiOnboardingLink"
    ADD CONSTRAINT "TiOnboardingLink_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
