-- Force password change on next login (generic / demo credentials)
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "mustChangePassword" BOOLEAN NOT NULL DEFAULT true;
